/*jslint bitwise: true, node: true */
'use strict';

var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var SAT = require('sat');
var sql = require("mysql");

// Import game settings.
var config = require('../../config.json');

// Import utilities.
var util = require('./lib/util');

// Import quadtree.
var quadtree = require('simple-quadtree');

//call sqlinfo
var s = config.sqlinfo;

var tree = quadtree(0, 0, config.gameWidth, config.gameHeight);

var users = [];
var massFood = [];
var food = [];
var missiles = [];
var sockets = {};
let counters = [];

var leaderboard = [];
var leaderboardChanged = false;

var V = SAT.Vector;
var C = SAT.Circle;

if (s.host !== "DEFAULT") {
    var pool = sql.createConnection({
        host: s.host,
        user: s.user,
        password: s.password,
        database: s.database
    });

    //log sql errors
    pool.connect(function (err) {
        if (err) {
            console.log(err);
        }
    });
}

var initMassLog = util.log(config.defaultPlayerMass, config.slowBase);

app.use(express.static(__dirname + '/../client'));

function movePlayer(player) {
    var x = 0, y = 0;

    var target = {
        x: player.x - player.cell.x + player.target.x,
        y: player.y - player.cell.y + player.target.y
    };
    var dist = Math.sqrt(Math.pow(target.y, 2) + Math.pow(target.x, 2));
    var deg = Math.atan2(target.y, target.x);
    var slowDown = 1;
    if (player.cell.speed <= 6.25) {
        slowDown = util.log(player.cell.mass, config.slowBase) - initMassLog + 1;
    }

    var deltaY = player.cell.speed * Math.sin(deg) / slowDown;
    var deltaX = player.cell.speed * Math.cos(deg) / slowDown;

    if (player.cell.speed > 6.25) {
        player.cell.speed -= 0.5;
    }
    if (dist < (50 + player.cell.radius)) {
        deltaY *= dist / (50 + player.cell.radius);
        deltaX *= dist / (50 + player.cell.radius);
    }
    if (!isNaN(deltaY)) {
        player.cell.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        player.cell.x += deltaX;
    }

    // Adjust camera
    var borderCalc = player.cell.radius / 3;
    if (player.cell.x > config.gameWidth - borderCalc) {
        player.cell.x = config.gameWidth - borderCalc;
    }
    if (player.cell.y > config.gameHeight - borderCalc) {
        player.cell.y = config.gameHeight - borderCalc;
    }
    if (player.cell.x < borderCalc) {
        player.cell.x = borderCalc;
    }
    if (player.cell.y < borderCalc) {
        player.cell.y = borderCalc;
    }

    player.x = player.cell.x;
    player.y = player.cell.y;
}

function moveMass(mass) {
    var deg = Math.atan2(mass.target.y, mass.target.x);
    var deltaY = mass.speed * Math.sin(deg);
    var deltaX = mass.speed * Math.cos(deg);

    mass.speed -= 0.5;
    if (mass.speed < 0) {
        mass.speed = 0;
    }
    if (!isNaN(deltaY)) {
        mass.y += deltaY;
    }
    if (!isNaN(deltaX)) {
        mass.x += deltaX;
    }

    var borderCalc = mass.radius + 5;

    if (mass.x > config.gameWidth - borderCalc) {
        mass.x = config.gameWidth - borderCalc;
    }
    if (mass.y > config.gameHeight - borderCalc) {
        mass.y = config.gameHeight - borderCalc;
    }
    if (mass.x < borderCalc) {
        mass.x = borderCalc;
    }
    if (mass.y < borderCalc) {
        mass.y = borderCalc;
    }
}


io.on('connection', function (socket) {
    console.log('A user connected!', socket.handshake.query.type);

    var type = socket.handshake.query.type;
    var radius = util.massToRadius(config.defaultPlayerMass);
    var position = config.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);

    var cell = {};
    var massTotal = 0;
    if (type === 'player') {
        cell = {
            mass: config.defaultPlayerMass,
            x: position.x,
            y: position.y,
            radius: radius
        };
        massTotal = config.defaultPlayerMass;
    }


    var currentPlayer = {
        id: socket.id,
        x: position.x,
        y: position.y,
        w: config.defaultPlayerMass,
        h: config.defaultPlayerMass,
        cell: cell,
        massTotal: massTotal,
        hue: Math.round(Math.random() * 360),
        type: type,
        lastHeartbeat: new Date().getTime(),
        target: {
            x: 0,
            y: 0
        },
        canShoot: true
    };

    socket.on('gotit', function (player) {
        console.log('[INFO] Player ' + player.name + ' connecting!');

        if (util.findIndex(users, player.id) > -1) {
            console.log('[INFO] Player ID is already connected, kicking.');
            socket.disconnect();
        } else if (!util.validNick(player.name)) {
            socket.emit('kick', 'Invalid username.');
            socket.disconnect();
        } else {
            console.log('[INFO] Player ' + player.name + ' connected!');
            sockets[player.id] = socket;

            var radius = util.massToRadius(config.defaultPlayerMass);
            var position = config.newPlayerInitialPosition == 'farthest' ? util.uniformPosition(users, radius) : util.randomPosition(radius);

            player.x = position.x;
            player.y = position.y;
            player.target.x = 0;
            player.target.y = 0;
            if (type === 'player') {
                player.cell = {
                    mass: config.defaultPlayerMass,
                    x: position.x,
                    y: position.y,
                    radius: radius
                };
                player.massTotal = config.defaultPlayerMass;
            }
            else {
                player.cell = {};
                player.massTotal = 0;
            }
            player.hue = Math.round(Math.random() * 360);
            currentPlayer = player;
            currentPlayer.lastHeartbeat = new Date().getTime();
            users.push(currentPlayer);

            io.emit('playerJoin', {name: currentPlayer.name});

            socket.emit('gameSetup', {
                gameWidth: config.gameWidth,
                gameHeight: config.gameHeight
            });
            console.log('Total players: ' + users.length);
        }

    });

    socket.on('pingcheck', function () {
        socket.emit('pongcheck');
    });

    socket.on('windowResized', function (data) {
        currentPlayer.screenWidth = data.screenWidth;
        currentPlayer.screenHeight = data.screenHeight;
    });

    socket.on('respawn', function () {
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        socket.emit('welcome', currentPlayer);
        console.log('[INFO] User ' + currentPlayer.name + ' respawned!');
    });

    socket.on('disconnect', function () {
        if (util.findIndex(users, currentPlayer.id) > -1)
            users.splice(util.findIndex(users, currentPlayer.id), 1);
        console.log('[INFO] User ' + currentPlayer.name + ' disconnected!');

        socket.broadcast.emit('playerDisconnect', {name: currentPlayer.name});
    });

    socket.on('playerChat', function (data) {
        var _sender = data.sender.replace(/(<([^>]+)>)/ig, '');
        var _message = data.message.replace(/(<([^>]+)>)/ig, '');
        if (config.logChat === 1) {
            console.log('[CHAT] [' + (new Date()).getHours() + ':' + (new Date()).getMinutes() + '] ' + _sender + ': ' + _message);
        }
        socket.broadcast.emit('serverSendPlayerChat', {sender: _sender, message: _message.substring(0, 35)});
    });

    socket.on('pass', function (data) {
        if (data[0] === config.adminPass) {
            console.log('[ADMIN] ' + currentPlayer.name + ' just logged in as an admin!');
            socket.emit('serverMSG', 'Welcome back ' + currentPlayer.name);
            socket.broadcast.emit('serverMSG', currentPlayer.name + ' just logged in as admin!');
            currentPlayer.admin = true;
        } else {

            // TODO: Actually log incorrect passwords.
            console.log('[ADMIN] ' + currentPlayer.name + ' attempted to log in with incorrect password.');
            socket.emit('serverMSG', 'Password incorrect, attempt logged.');
            pool.query('INSERT INTO logging SET name=' + currentPlayer.name + ', reason="Invalid login attempt as admin"');
        }
    });

    socket.on('kick', function (data) {
        if (currentPlayer.admin) {
            var reason = '';
            var worked = false;
            for (var e = 0; e < users.length; e++) {
                if (users[e].name === data[0] && !users[e].admin && !worked) {
                    if (data.length > 1) {
                        for (var f = 1; f < data.length; f++) {
                            if (f === data.length) {
                                reason = reason + data[f];
                            }
                            else {
                                reason = reason + data[f] + ' ';
                            }
                        }
                    }
                    if (reason !== '') {
                        console.log('[ADMIN] User ' + users[e].name + ' kicked successfully by ' + currentPlayer.name + ' for reason ' + reason);
                    }
                    else {
                        console.log('[ADMIN] User ' + users[e].name + ' kicked successfully by ' + currentPlayer.name);
                    }
                    socket.emit('serverMSG', 'User ' + users[e].name + ' was kicked by ' + currentPlayer.name);
                    sockets[users[e].id].emit('kick', reason);
                    sockets[users[e].id].disconnect();
                    users.splice(e, 1);
                    worked = true;
                }
            }
            if (!worked) {
                socket.emit('serverMSG', 'Could not locate user or user is an admin.');
            }
        } else {
            console.log('[ADMIN] ' + currentPlayer.name + ' is trying to use -kick but isn\'t an admin.');
            socket.emit('serverMSG', 'You are not permitted to use this command.');
        }
    });

    // Heartbeat function, update everytime.
    socket.on('0', function (target) {
        currentPlayer.lastHeartbeat = new Date().getTime();
        if (target.x !== currentPlayer.x || target.y !== currentPlayer.y) {
            currentPlayer.target = target;
        }
    });
    socket.on('shootMissile', function () {
        function calculateDirection(x, y, speed) {
            let clickDistance = Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2));
            return {
                dx: (speed * x) / clickDistance,
                dy: (speed * y) / clickDistance
            };
        }

        if (!currentPlayer.canShoot) {
            return;
        }
        currentPlayer.canShoot = false;
        setTimeout(function () {
            currentPlayer.canShoot = true;
        }, 500);
        const masa = 10;
        const speed = 15;
        let direction = calculateDirection(currentPlayer.target.x, currentPlayer.target.y, speed);
        missiles.push({
            id: currentPlayer.id,
            masa: masa,
            hue: currentPlayer.hue,
            direction: direction,
            x: currentPlayer.cell.x,
            y: currentPlayer.cell.y,
            distanceTraveled: 0,
            radius: util.massToRadius(masa),
            speed: speed,
            damage: 20
        });
    });
});

function tickPlayer(currentPlayer) {
    if (currentPlayer.lastHeartbeat < new Date().getTime() - config.maxHeartbeatInterval) {
        sockets[currentPlayer.id].emit('kick', 'Last heartbeat received over ' + config.maxHeartbeatInterval + ' ago.');
        sockets[currentPlayer.id].disconnect();
    }

    movePlayer(currentPlayer);

    function funcFood(f) {
        return SAT.pointInCircle(new V(f.x, f.y), playerCircle);
    }

    function deleteFood(f) {
        food[f] = {};
        food.splice(f, 1);
    }


    function check(user) {
        if (user.cell.mass > 10 && user.id !== currentPlayer.id) {
            var response = new SAT.Response();
            var collided = SAT.testCircleCircle(playerCircle,
                new C(new V(user.cell.x, user.cell.y), user.cell.radius),
                response);
            if (collided) {
                response.aUser = currentCell;
                response.bUser = {
                    id: user.id,
                    name: user.name,
                    x: user.cell.x,
                    y: user.cell.y,
                    mass: user.cell.mass
                };
                playerCollisions.push(response);
            }
        }
        return true;
    }

    var currentCell = currentPlayer.cell;
    var playerCircle = new C(
        new V(currentCell.x, currentCell.y),
        currentCell.radius
    );

    var foodEaten = food.map(funcFood)
        .reduce(function (a, b, c) {
            return b ? a.concat(c) : a;
        }, []);

    foodEaten.forEach(deleteFood);

    var masaGanada = 0;


    if (typeof(currentCell.speed) == "undefined")
        currentCell.speed = 6.25;
    masaGanada += (foodEaten.length * config.foodMass);
    currentCell.mass += masaGanada;
    currentPlayer.massTotal += masaGanada;
    currentCell.radius = util.massToRadius(currentCell.mass);
    playerCircle.r = currentCell.radius;

    tree.clear();
    users.forEach(tree.put);
    var playerCollisions = [];

    var otherUsers = tree.get(currentPlayer, check);
}

function moveloop() {
    for (var i = 0; i < users.length; i++) {
        tickPlayer(users[i]);
    }
    for (i = 0; i < massFood.length; i++) {
        if (massFood[i].speed > 0) moveMass(massFood[i]);
    }
}

function gameloop() {
    if (users.length > 0) {
        users.sort(function (a, b) {
            return b.massTotal - a.massTotal;
        });

        var topUsers = [];

        for (var i = 0; i < Math.min(10, users.length); i++) {
            if (users[i].type == 'player') {
                topUsers.push({
                    id: users[i].id,
                    name: users[i].name
                });
            }
        }
        if (isNaN(leaderboard) || leaderboard.length !== topUsers.length) {
            leaderboard = topUsers;
            leaderboardChanged = true;
        }
        else {
            for (i = 0; i < leaderboard.length; i++) {
                if (leaderboard[i].id !== topUsers[i].id) {
                    leaderboard = topUsers;
                    leaderboardChanged = true;
                    break;
                }
            }
        }
        for (i = 0; i < users.length; i++) {
            if (users[i].cell.mass * (1 - (config.massLossRate / 1000)) > config.defaultPlayerMass && users[i].massTotal > config.minMassLoss) {
                var massLoss = users[i].cell.mass * (1 - (config.massLossRate / 1000));
                users[i].massTotal -= users[i].cell.mass - massLoss;
                users[i].cell.mass = massLoss;
            }
        }
    }
}

function sendUpdates() {
    users.forEach(function (user) {
        // center the view if x/y is undefined, this will happen for spectators
        user.x = user.x || config.gameWidth / 2;
        user.y = user.y || config.gameHeight / 2;

        function traveledEntireDistance(missile) {
            return missile.distanceTraveled > config.missile.maxTravelDistance;
        }

        let visibleMissile = missiles
            .map(function (missile) {
                missile.x = missile.x + missile.direction.dx;
                missile.y = missile.y + missile.direction.dy;

                missile.distanceTraveled += Math.sqrt(Math.pow(missile.direction.dx * missile.speed, 2) + Math.pow(missile.direction.dy * missile.speed, 2));

                if (missile.x > user.x - user.screenWidth / 2 - missile.radius &&
                    missile.x < user.x + user.screenWidth / 2 + missile.radius &&
                    missile.y > user.y - user.screenHeight / 2 - missile.radius &&
                    missile.y < user.y + user.screenHeight / 2 + missile.radius) {
                    return missile;
                }
            })
            .filter(function (f) {
                return f;
            });

        visibleMissile.forEach(function (missile) {
            function collisionCheck(user, missile) {
                let response = new SAT.Response();

                function checkIfCircleColide() {
                    return SAT.testCircleCircle(new C(
                        new V(user.cell.x, user.cell.y),
                        user.cell.radius
                    ), new C(
                        new V(missile.x, missile.y),
                        missile.radius
                    ), response);
                }

                if (user.id == missile.id) {
                    return;
                }
                if (checkIfCircleColide()){
                    var userNumber = util.findIndex(users, user.id);
                    users.splice(userNumber, 1);
                    io.emit('playerDied', { name: user.name });
                    sockets[user.id].emit('RIP');

                    var missileMumber = util.findIndex(users, user.id);
                    missiles.splice(missileMumber, 1);
                }
            }

            collisionCheck(user, missile);
        });

        var visibleCells = users
            .map(function (f) {
                if (f.id !== user.id) {
                    return {
                        id: f.id,
                        x: f.x,
                        y: f.y,
                        cell: f.cell,
                        massTotal: Math.round(f.massTotal),
                        hue: f.hue,
                        name: f.name
                    };
                }
                return {
                    x: f.x,
                    y: f.y,
                    cell: f.cell,
                    massTotal: Math.round(f.massTotal),
                    hue: f.hue,
                };
            })
            .filter(function (f) {
                return f;
            });

        sockets[user.id].emit('serverTellPlayerMove', visibleCells, visibleMissile);
        if (leaderboardChanged) {
            sockets[user.id].emit('leaderboard', {
                players: users.length,
                leaderboard: leaderboard
            });
        }
    });
    leaderboardChanged = false;
}

setInterval(moveloop, 1000 / 60);
setInterval(gameloop, 1000);
setInterval(sendUpdates, 1000 / config.networkUpdateFactor);

// Don't touch, IP configurations.
var ipaddress = process.env.OPENSHIFT_NODEJS_IP || process.env.IP || config.host;
var serverport = process.env.OPENSHIFT_NODEJS_PORT || process.env.PORT || config.port;
http.listen(serverport, ipaddress, function () {
    console.log('[DEBUG] Listening on ' + ipaddress + ':' + serverport);
});
