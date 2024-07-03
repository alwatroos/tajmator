// Move the mouse across the screen as a sine wave.
const robot = require("robotjs");

const distance = (a = { x: 0, y: 0 }, b = { x: 0, y: 0 }) =>
  Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

const delay = (ms = 60000) => new Promise((resolve) => setTimeout(resolve, ms));
const isBetween = (min, max, value) => value >= min && value <= max;
const START_HOUR = 7;
const END_HOUR = 17;
const ONE_HOUR = 1000 * 60 * 60;
const ONE_MINUTE = 1000 * 60;

(async () => {
  console.clear();
  console.log("Mouse Mover is running. Press CTRL + C to exit.");
  robot.setMouseDelay(2);

  let position = robot.getMousePos();
  let nextMove = 5;
  let timeOff = 0;
  while (true) {
    const date = new Date();
    const hour = date.getHours();
    let delayTime = ONE_MINUTE;
    if (!isBetween(START_HOUR, END_HOUR, hour)) {
      console.log(`Sleeping...`);
      delayTime = ONE_HOUR;
    } else {
      const { x, y } = robot.getMousePos();
      if (distance(position, { x, y }) < 1) {
        timeOff += 1;
        console.log("Moving mouse... Idle time: ", timeOff, " minutes");
        robot.moveMouse(x + nextMove, y + nextMove);
        nextMove *= -1;
      } else {
        timeOff = 0;
      }
      position = robot.getMousePos();
    }

    await delay(delayTime);
  }
})();
