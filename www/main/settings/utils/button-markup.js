import React from 'react';
import { changeOrder } from './change-order';

export const buttonMarkup = (element, slideOrder, setSlideOrder) => (
  <>
    <div className="verse-controls">
      <div
        className="left-control"
        onClick={() => {
          const newOrder = changeOrder(element, 'up', [...slideOrder]);
          if (newOrder !== slideOrder) {
            setSlideOrder(newOrder);
          }
        }}
      >
        <img src="../www/assets/img/icons/arrow-up.svg" />
      </div>
      <div
        className="right-control"
        onClick={() => {
          const newOrder = changeOrder(element, 'down', [...slideOrder]);
          if (newOrder !== slideOrder) {
            setSlideOrder(newOrder);
          }
        }}
      >
        <img src="../www/assets/img/icons/arrow-down.svg" />
      </div>
    </div>
  </>
);
