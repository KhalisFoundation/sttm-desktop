export const changeOrder = (element, direction, orderArray) => {
  const initialOrder = [...orderArray];
  const currentOrder = initialOrder.findIndex(item => item === element);
  if (currentOrder >= 0) {
    const maxIndex = initialOrder.length - 1;
    if (direction === 'up' && currentOrder > 0) {
      [initialOrder[currentOrder], initialOrder[currentOrder - 1]] = [
        initialOrder[currentOrder - 1],
        initialOrder[currentOrder],
      ];
    } else if (direction === 'down' && currentOrder < maxIndex) {
      [initialOrder[currentOrder], initialOrder[currentOrder + 1]] = [
        initialOrder[currentOrder + 1],
        initialOrder[currentOrder],
      ];
    }
  }
  return initialOrder;
};
