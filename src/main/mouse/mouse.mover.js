import nut from '@nut-tree-fork/nut-js';

const { mouse, Point } = nut;

/**
 * Nudge the cursor by one pixel and back to keep the session awake.
 * The round-trip leaves the pointer exactly where the user left it.
 * @returns {Promise<void>} Resolves once the cursor returns to origin.
 */
export const jiggleMouse = async () => {
  const origin = await mouse.getPosition();
  await mouse.setPosition(new Point(origin.x + 1, origin.y + 1));
  await mouse.setPosition(origin);
};
