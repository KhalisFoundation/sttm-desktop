// How Voice Autopilot compares what it hears with a pangti, keeping the pangti exactly as the
// database gives it.
//
// A pangti is Satguru's Bani: it is never altered, not even in memory for a comparison. A
// Compared view keeps the text untouched and lists the positions of the characters a
// comparison looks at. Spaces, dandas, numbers and punctuation are skipped over while
// comparing (ignored); nothing is removed from the text and no shortened copy of it is made.
// Heard text (the speech model's output) is read through the same view.
//
// Optional rules for a view, used only while comparing:
//   skip(cp)  - also skip this character (a code point; e.g. vowel signs, for a letters-only
//               comparison)
//   fold(cp)  - compare this character as another one (e.g. a letter with a nukta as the
//               letter itself); the text still holds the character as written.

/* eslint-disable max-classes-per-file */ // a view and its several-words form

// spaces, dandas, the | separator, ASCII and Gurmukhi numbers, punctuation
const IGNORED = /[\s।॥|0-9੦-੯.,;:!?-]/;
// the same set as a table over every UTF-16 unit, so a view is quick to make
const IGNORED_UNIT = new Uint8Array(0x10000);
for (let u = 0; u < 0x10000; u += 1) if (IGNORED.test(String.fromCharCode(u))) IGNORED_UNIT[u] = 1;
const isIgnored = (ch) => IGNORED.test(ch);

class Compared {
  constructor(text, { skip = null, fold = null } = {}) {
    const t = typeof text === 'string' ? text : '';
    this.text = t; // as given, never changed
    this.fold = fold;
    const at = [];
    for (let i = 0; i < t.length;) {
      const cp = t.codePointAt(i);
      const w = cp > 0xffff ? 2 : 1;
      if (!(w === 1 && IGNORED_UNIT[cp]) && !(skip && skip(cp))) at.push(i);
      i += w;
    }
    this.at = Int32Array.from(at); // where in `text` each compared character is
    this.length = at.length; // how many characters a comparison looks at
  }

  // The k-th compared character, as a code point (after `fold`, if the view has one).
  code(k) {
    const cp = this.text.codePointAt(this.at[k]);
    return this.fold ? this.fold(cp) : cp;
  }
}

// Several texts (the words of a pangti, each untouched) read one after another as one
// comparison, without joining them into a new text.
class ComparedJoin extends Compared {
  constructor(views) {
    super('');
    const vs = views || [];
    const part = [];
    const at = [];
    vs.forEach((v, n) => {
      for (let k = 0; k < v.length; k += 1) {
        part.push(n);
        at.push(v.at[k]);
      }
    });
    this.texts = vs.map((v) => v.text);
    this.text = null; // several texts: see `texts`
    this.fold = vs.length ? vs[0].fold : null;
    this.part = Int32Array.from(part); // which text each compared character is in
    this.at = Int32Array.from(at); // where in that text
    this.length = at.length;
  }

  code(k) {
    const cp = this.texts[this.part[k]].codePointAt(this.at[k]);
    return this.fold ? this.fold(cp) : cp;
  }
}

// A view of `x` (a view is returned as it is).
const compared = (x, rules) => (x instanceof Compared ? x : new Compared(x, rules));

// Do two texts compare as the same (every compared character equal)?
function sameCompared(x, y) {
  const a = compared(x);
  const b = compared(y);
  if (a.length !== b.length) return false;
  for (let k = 0; k < a.length; k += 1) if (a.code(k) !== b.code(k)) return false;
  return true;
}

// Order of two views by their compared characters, as a string sort of what is compared would
// order them (by UTF-16 code units).
const units = (cp) => (cp > 0xffff ? String.fromCodePoint(cp) : cp);
function orderCompared(a, b) {
  const n = Math.min(a.length, b.length);
  for (let k = 0; k < n; k += 1) {
    const x = a.code(k);
    const y = b.code(k);
    if (x !== y) {
      const ux = units(x);
      const uy = units(y);
      if (typeof ux === 'number' && typeof uy === 'number') return ux - uy;
      const sx = typeof ux === 'number' ? String.fromCharCode(ux) : ux;
      const sy = typeof uy === 'number' ? String.fromCharCode(uy) : uy;
      return sx < sy ? -1 : 1;
    }
  }
  return a.length - b.length;
}

// A number for the compared characters of a view (equal views hash equal): lets a Map find
// views that compare the same without keeping any altered text as a key.
/* eslint-disable no-bitwise */ // FNV-1a hash
function hashCompared(v) {
  let h = 2166136261;
  for (let k = 0; k < v.length; k += 1) h = Math.imul(h ^ v.code(k), 16777619);
  return (h ^ v.length) >>> 0;
}
/* eslint-enable no-bitwise */

module.exports = {
  Compared,
  ComparedJoin,
  compared,
  sameCompared,
  orderCompared,
  hashCompared,
  isIgnored,
};
