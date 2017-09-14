fusionshot
=============

A simple game built with socket.IO and HTML5 canvas on top of NodeJS.

## Try it [here] (https://fusionshot.herokuapp.com/)

## How to Play
Move your mouse around the screen to move your cell.
Click left mouse button to shoot a missile.

#### Game Basics
- Move your mouse around the screen to move your cell.
- Each player has 
- **Objective**: Try to kill as many opponent as possible.

## Installation

#### Requirements
To run / install this game, you'll need: 
- NodeJS with NPM installed.
- socket.IO.
- Express.


#### Downloading the dependencies
After cloning the source code from Github, you need to run the following command to download all the dependencies (socket.IO, express, etc.):

```
npm install
```

#### Running the Server
After downloading all the dependencies, you can run the server with the following command:

```
npm start
```

The game will then be accessible at `http://localhost:3000` or the respective server installed on. The default port is `3000`, however this can be changed in config. Further elaboration is available on our [wiki](https://github.com/huytd/agar.io-clone/wiki/Setup).


### Running the Server with Docker
If you have [Docker](https://www.docker.com/) installed, after cloning the repository you can run the following commands to start the server and make it acessible at `http://localhost:3000`:

```
docker build -t fusionshot .
docker run -it -p 3000:3000 fusionshot
```

---

## License
This project was based on agar.io-clone, check [here](https://github.com/huytd/agar.io-clone). This project is licensed under the terms of the **MIT** license.

>You can check out the full license [here](https://github.com/huytd/agar.io-clone/blob/master/LICENSE).

