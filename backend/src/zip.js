// ZIP simples em streaming (método "store", sem compressão) — sem dependências.
// Cada arquivo é escrito direto na resposta; só o índice final fica em memória.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function dosTime(d = new Date()) {
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { time, date };
}

export function createZip(out) {
  const entries = [];
  let offset = 0;
  const write = (b) => new Promise((resolve, reject) => {
    offset += b.length;
    if (out.write(b)) return resolve();
    out.once("drain", resolve);
    out.once("error", reject);
  });
  const used = new Set();
  const uniqueName = (name) => {
    let n = name, i = 2;
    const dot = name.lastIndexOf(".");
    while (used.has(n.toLowerCase())) { n = dot > name.lastIndexOf("/") ? `${name.slice(0, dot)} (${i})${name.slice(dot)}` : `${name} (${i})`; i++; }
    used.add(n.toLowerCase());
    return n;
  };
  return {
    async add(name, data) {
      const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
      const fname = Buffer.from(uniqueName(name), "utf8");
      const crc = crc32(buf);
      const { time, date } = dosTime();
      const h = Buffer.alloc(30);
      h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt16LE(0, 8);
      h.writeUInt16LE(time, 10); h.writeUInt16LE(date, 12); h.writeUInt32LE(crc, 14);
      h.writeUInt32LE(buf.length, 18); h.writeUInt32LE(buf.length, 22); h.writeUInt16LE(fname.length, 26); h.writeUInt16LE(0, 28);
      entries.push({ fname, crc, size: buf.length, offset, time, date });
      await write(h); await write(fname); await write(buf);
    },
    async finish() {
      const start = offset;
      for (const e of entries) {
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt16LE(0, 10);
        c.writeUInt16LE(e.time, 12); c.writeUInt16LE(e.date, 14); c.writeUInt32LE(e.crc, 16);
        c.writeUInt32LE(e.size, 20); c.writeUInt32LE(e.size, 24); c.writeUInt16LE(e.fname.length, 28);
        c.writeUInt16LE(0, 30); c.writeUInt16LE(0, 32); c.writeUInt16LE(0, 34); c.writeUInt16LE(0, 36); c.writeUInt32LE(0, 38); c.writeUInt32LE(e.offset, 42);
        await write(c); await write(e.fname);
      }
      const size = offset - start;
      const z = Buffer.alloc(22);
      z.writeUInt32LE(0x06054b50, 0); z.writeUInt16LE(0, 4); z.writeUInt16LE(0, 6);
      z.writeUInt16LE(entries.length, 8); z.writeUInt16LE(entries.length, 10); z.writeUInt32LE(size, 12); z.writeUInt32LE(start, 16); z.writeUInt16LE(0, 20);
      await write(z);
      out.end();
    }
  };
}
