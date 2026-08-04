// Shallow equality for the plain objects returned by easy-peasy `useStoreState`
// selectors. Passing this as the selector's equality function lets a component
// subscribe only to the store fields it actually uses: it re-renders only when
// one of those values changes, not on every mutation elsewhere
// in the same slice (e.g. high-frequency Akhand Paatth scroll-speed ticks).
const shallowEqual = (objA, objB) => {
  if (Object.is(objA, objB)) {
    return true;
  }
  if (typeof objA !== 'object' || objA === null || typeof objB !== 'object' || objB === null) {
    return false;
  }

  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(objB, key) && Object.is(objA[key], objB[key]),
  );
};

export default shallowEqual;
