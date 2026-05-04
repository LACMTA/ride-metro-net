export const directionNames = {
  N: "Northbound",
  S: "Sourthbound",
  E: "Eastbound",
  W: "Westbound",
};

export default {
  // A line
  "801": {
    0: directionNames.N,
    1: directionNames.S,
  },
  // B line
  "802": {
    0: directionNames.E,
    1: directionNames.W,
  },
  // D line
  "805": {
    0: directionNames.E,
    1: directionNames.W,
  },
  // C line
  "803": {
    0: directionNames.W,
    1: directionNames.E,
  },
  // E line
  "804": {
    0: directionNames.E,
    1: directionNames.W,
  },
  // K line
  "807": {
    0: directionNames.N,
    1: directionNames.S,
  },
};
