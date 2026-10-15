export function createArena(width = 1200, height = 800) {
  return { width, height };
}

export function wrapShip(ship, previousShip, arena) {
  if (ship.x < 0) {
    ship.x += arena.width;
    if (previousShip) previousShip.x += arena.width;
  } else if (ship.x >= arena.width) {
    ship.x -= arena.width;
    if (previousShip) previousShip.x -= arena.width;
  }

  if (ship.y < 0) {
    ship.y += arena.height;
    if (previousShip) previousShip.y += arena.height;
  } else if (ship.y >= arena.height) {
    ship.y -= arena.height;
    if (previousShip) previousShip.y -= arena.height;
  }
}