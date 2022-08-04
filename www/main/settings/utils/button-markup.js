import React from 'react';
import { changeOrder } from './change-order';

export const buttonMarkup = (element, slideOrder, setSlideOrder) => {
  return (
    <>
      <button
        onClick={() => {
          const newOrder = changeOrder(element, 'up', [...slideOrder]);
          if (newOrder !== slideOrder) {
            setSlideOrder(newOrder);
          }
        }}
      >
        ↑
      </button>
      <button
        onClick={() => {
          const newOrder = changeOrder(element, 'down', [...slideOrder]);
          if (newOrder !== slideOrder) {
            setSlideOrder(newOrder);
          }
        }}
      >
        ↓
      </button>
    </>
  );
};
