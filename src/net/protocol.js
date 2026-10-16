export const MSG_TYPE = {
  BINARY_INPUT: 1,
};

export function encodeInputBinary({ x, y, angle, thrust, firing }) {
  const buffer = new ArrayBuffer(14);
  const view = new DataView(buffer);

  const flags = (thrust ? 1 : 0) | (firing ? 2 : 0);

  view.setUint8(0, MSG_TYPE.BINARY_INPUT);
  view.setUint8(1, flags);
  view.setFloat32(2, x, true);
  view.setFloat32(6, y, true);
  view.setFloat32(10, angle, true);

  return buffer;
}

/**
 * Декодує 14-байтний пакет назад в об'єкт телеметрії.
 */
export function decodeInputBinary(data) {
  const arrayBuffer = data.buffer
    ? data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength)
    : data;

  if (arrayBuffer.byteLength < 14) return null;

  const view = new DataView(arrayBuffer);
  const type = view.getUint8(0);
  if (type !== MSG_TYPE.BINARY_INPUT) return null;

  const flags = view.getUint8(1);
  return {
    thrust: Boolean(flags & 1),
    firing: Boolean(flags & 2),
    x: view.getFloat32(2, true),
    y: view.getFloat32(6, true),
    angle: view.getFloat32(10, true),
  };
}