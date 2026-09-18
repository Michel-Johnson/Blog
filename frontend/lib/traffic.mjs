import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { atomicWriteJson } from './atomic-file.mjs';

const BITS = 65536;
const dayKey = date => new Date(date.getTime() + 8 * 3600000).toISOString().slice(0,10);
const estimate = bits => {
  let filled = 0;
  for (let n of bits) { while (n) { n &= n - 1; filled++; } }
  return Math.round(-BITS * Math.log(Math.max(1, BITS - filled) / BITS));
};

export async function createTrafficStore(file) {
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  data ||= { since: new Date().toISOString(), days: {} };
  data.addresses ||= {};
  let generation = 0, persisted = 0, writing = null;
  const pruneAddresses = () => {
    const cutoff = Date.now() - 30 * 86400000;
    for (const [ip, entry] of Object.entries(data.addresses)) {
      if (Date.parse(entry.lastVisit) < cutoff) { delete data.addresses[ip]; generation++; }
    }
  };
  const visitors = new Map(Object.entries(data.days).map(([day, value]) => [day, Buffer.from(value.bits, 'base64')]));
  return {
    record(id, page, now = new Date(), address = '') {
      if (!/^[a-zA-Z0-9_-]{16,80}$/.test(id)) return false;
      const key = dayKey(now);
      data.days[key] ||= { pv: 0, pages: {}, bits: '' };
      if (!visitors.has(key)) visitors.set(key, Buffer.alloc(BITS / 8));
      const day = data.days[key];
      day.pv++;
      const bucket = Object.hasOwn(day.pages, page) || Object.keys(day.pages).length < 100 ? page : '其他页面';
      day.pages[bucket] = (day.pages[bucket] || 0) + 1;
      const index = createHash('sha256').update(id).digest().readUInt16BE(0);
      const bitmap = visitors.get(key);
      bitmap[index >>> 3] |= 1 << (index & 7);
      const ip = String(address).replace(/^::ffff:/i, '');
      if (isIP(ip)) {
        const previous = data.addresses[ip];
        data.addresses[ip] = { ip, lastVisit:now.toISOString(), page, views:(previous?.views || 0) + 1 };
        if (Object.keys(data.addresses).length > 1000) {
          const oldest = Object.keys(data.addresses).sort((a,b) => data.addresses[a].lastVisit.localeCompare(data.addresses[b].lastVisit))[0];
          delete data.addresses[oldest];
        }
      }
      for (const old of Object.keys(data.days).sort().slice(0,-366)) { delete data.days[old]; visitors.delete(old); }
      generation++;
      return true;
    },
    summary() {
      pruneAddresses();
      const rows = Object.entries(data.days).sort(([a],[b]) => b.localeCompare(a)).map(([date, day]) => ({ date, views:day.pv, visitors:estimate(visitors.get(date)), pages:day.pages }));
      const union = Buffer.alloc(BITS / 8);
      for (const bits of visitors.values()) for (let i=0; i<union.length; i++) union[i] |= bits[i];
      return { since:data.since, timezone:'Asia/Shanghai', estimated:true, views:rows.reduce((n,r)=>n+r.views,0), visitors:estimate(union), days:rows, addresses:Object.values(data.addresses).sort((a,b) => b.lastVisit.localeCompare(a.lastVisit)) };
    },
    async flush() {
      pruneAddresses();
      if (writing) { await writing; }
      if (generation === persisted) return;
      const version = generation;
      for (const [day,bits] of visitors) data.days[day].bits = bits.toString('base64');
      const snapshot = JSON.parse(JSON.stringify(data));
      writing = atomicWriteJson(file, snapshot);
      try { await writing; persisted = version; } finally { writing = null; }
    }
  };
}
