const net = require('net');

const SERVER_HOST = 'sd-br7.blazebr.com';
const SERVER_PORT = 25836;

function writeVarInt(value) {
  const bytes = [];
  let val = value;
  do {
    let temp = val & 0b01111111;
    val >>>= 7;
    if (val !== 0) temp |= 0b10000000;
    bytes.push(temp);
  } while (val !== 0);
  return Buffer.from(bytes);
}

function readVarInt(buffer, offset = 0) {
  let num = 0;
  let shift = 0;
  let i = offset;
  let byte;
  do {
    byte = buffer[i++];
    num |= (byte & 0x7f) << shift;
    shift += 7;
    if (shift > 35) throw new Error('VarInt too big');
  } while (byte & 0x80);
  return { value: num, bytesRead: i - offset };
}

function buildHandshake(host, port) {
  const hostBuf = Buffer.from(host, 'utf8');
  let packet = Buffer.concat([
    writeVarInt(0x00),
    writeVarInt(763),
    writeVarInt(hostBuf.length),
    hostBuf,
    Buffer.from([(port >> 8) & 0xff, port & 0xff]),
    writeVarInt(1),
  ]);
  return Buffer.concat([writeVarInt(packet.length), packet]);
}

function buildStatusRequest() {
  const packet = Buffer.from([0x00]);
  return Buffer.concat([writeVarInt(packet.length), packet]);
}

function pingServer(timeout = 5000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const finish = (result) => {
      if (resolved) return;
      resolved = true;
      try { socket.destroy(); } catch {}
      resolve(result);
    };

    socket.setTimeout(timeout);

    socket.connect(SERVER_PORT, SERVER_HOST, () => {
      socket.write(buildHandshake(SERVER_HOST, SERVER_PORT));
      socket.write(buildStatusRequest());
    });

    let buffer = Buffer.alloc(0);

    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const { value: packetLen, bytesRead: lenBytes } = readVarInt(buffer, 0);
        if (buffer.length < lenBytes + packetLen) return;

        const packetId = buffer[lenBytes];
        if (packetId === 0x00) {
          const { value: jsonLen, bytesRead: jsonLenBytes } = readVarInt(buffer, lenBytes + 1);
          const jsonStart = lenBytes + 1 + jsonLenBytes;
          const jsonStr = buffer.slice(jsonStart, jsonStart + jsonLen).toString('utf8');
          const data = JSON.parse(jsonStr);

          const players = data.players || {};
          const online = players.online || 0;
          const max = players.max || 0;
          const sample = (players.sample || []).map((p) => p.name.toLowerCase());

          finish({
            online: true,
            playersOnline: online,
            playersMax: max,
            players: sample,
            motd: typeof data.description === 'string'
              ? data.description
              : data.description?.text || '',
          });
        }
      } catch {}
    });

    socket.on('timeout', () => finish({ online: false }));
    socket.on('error', () => finish({ online: false }));
  });
}

async function getServerStatus() {
  try {
    return await pingServer();
  } catch {
    return { online: false, playersOnline: 0, playersMax: 0, players: [] };
  }
}

module.exports = {
  getServerStatus,
  SERVER_HOST,
  SERVER_PORT,
  SERVER_ADDRESS: `${SERVER_HOST}:${SERVER_PORT}`,
};
