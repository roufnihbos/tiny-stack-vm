import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const D = new Int32Array(256);
  const C = new Int32Array(64);
  const M = new Int32Array(256);
  const out = new Uint8Array(65536);
  let sp = 0, csp = 0, olen = 0, ip = 0, pc = 0, steps = 0;
  const fin = (code: number): [Uint8Array, number] => [out.slice(0, olen), code];
  const imms: Record<number, number> = { 1: 1, 2: 4, 0x30: 2, 0x31: 2, 0x32: 2, 0x33: 2 };
  const pops: Record<number, number> = {
    0: 0, 1: 0, 2: 0, 3: 1, 4: 1, 5: 2, 6: 2, 7: 3,
    0x10: 2, 0x11: 2, 0x12: 2, 0x13: 2, 0x14: 2, 0x15: 2, 0x16: 2, 0x17: 1,
    0x18: 2, 0x19: 2, 0x1a: 2, 0x1b: 1, 0x1c: 2, 0x1d: 2, 0x1e: 2,
    0x20: 2, 0x21: 2, 0x22: 2, 0x30: 0, 0x31: 1, 0x32: 1, 0x33: 0, 0x34: 0,
    0x40: 1, 0x41: 2, 0x50: 1, 0x51: 1, 0x52: 0, 0x53: 1,
  };
  const pushes: Record<number, number> = {
    1: 1, 2: 1, 4: 2, 6: 3, 7: 3, 0x40: 1, 0x52: 1,
  };
  for (;;) {
    if (steps === 1000000) return fin(10);
    if (pc < 0 || pc >= n) return fin(9);
    const o = p[pc];
    if (!(o in pops)) return fin(5);
    const imm = imms[o] ?? 0;
    if (pc + imm >= n) return fin(9);
    steps++;
    const next = pc + 1 + imm;
    const pp = pops[o];
    const ps = o >= 0x10 && o <= 0x22 ? 1 : pushes[o] ?? 0;
    if (sp < pp) return fin(2);
    if (sp - pp + ps > 256) return fin(3);
    pc = next;
    switch (o) {
      case 0: return fin(0);
      case 1: D[sp++] = (p[next - 1] << 24) >> 24; break;
      case 2: D[sp++] = p[next - 4] | (p[next - 3] << 8) | (p[next - 2] << 16) | (p[next - 1] << 24); break;
      case 3: sp--; break;
      case 4: D[sp] = D[sp - 1]; sp++; break;
      case 5: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 6: D[sp] = D[sp - 2]; sp++; break;
      case 7: { const a = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = a; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rel = ((p[next - 2] | (p[next - 1] << 8)) << 16) >> 16;
        let take = true;
        if (o !== 0x30) { const v = D[--sp]; take = o === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = next + rel;
        break;
      }
      case 0x33:
        if (csp === 64) return fin(7);
        C[csp++] = next;
        pc = p[next - 2] | (p[next - 1] << 8);
        break;
      case 0x34:
        if (csp === 0) return fin(8);
        pc = C[--csp];
        break;
      case 0x40: {
        const ad = D[sp - 1];
        if (ad < 0 || ad >= 256) return fin(6);
        D[sp - 1] = M[ad];
        break;
      }
      case 0x41: {
        const ad = D[sp - 1], v = D[sp - 2];
        if (ad < 0 || ad >= 256) return fin(6);
        sp -= 2;
        M[ad] = v;
        break;
      }
      case 0x50: {
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) return fin(11);
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51:
        if (olen + 1 > 65536) return fin(11);
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: return fin(D[--sp] & 255);
      default: {
        const b = D[sp - 1], a = D[sp - 2];
        let r = 0;
        switch (o) {
          case 0x10: r = (a + b) | 0; break;
          case 0x11: r = (a - b) | 0; break;
          case 0x12: r = Math.imul(a, b); break;
          case 0x13: case 0x14: case 0x15: case 0x16:
            if (b === 0) return fin(4);
            r = o === 0x13 ? (a === -2147483648 && b === -1 ? a : (a / b) | 0)
              : o === 0x14 ? (b === -1 ? 0 : a % b | 0)
              : o === 0x15 ? Math.floor((a >>> 0) / (b >>> 0)) | 0
              : (a >>> 0) % (b >>> 0) | 0;
            break;
          case 0x18: r = a & b; break;
          case 0x19: r = a | b; break;
          case 0x1a: r = a ^ b; break;
          case 0x1c: r = a << (b & 31); break;
          case 0x1d: r = a >> (b & 31); break;
          case 0x1e: r = (a >>> (b & 31)) | 0; break;
          case 0x20: r = a === b ? 1 : 0; break;
          case 0x21: r = a < b ? 1 : 0; break;
          case 0x22: r = a >>> 0 < b >>> 0 ? 1 : 0; break;
        }
        sp -= 2;
        D[sp++] = r;
      }
    }
  }
}

const inDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';
for (const id of readdirSync(inDir).sort()) {
  let prog: Uint8Array, inp: Uint8Array;
  try {
    prog = readFileSync(`${inDir}/${id}/program.bin`);
    inp = readFileSync(`${inDir}/${id}/input.bin`);
  } catch {
    continue;
  }
  const [o, code] = run(prog, inp);
  mkdirSync(`${outDir}/${id}`, { recursive: true });
  writeFileSync(`${outDir}/${id}/stdout.bin`, o);
  writeFileSync(`${outDir}/${id}/exit.txt`, String(code));
}
