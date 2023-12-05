import React from 'react';
import { useStoreState } from 'easy-peasy';

const SearchFooter = () => {
  const { searchShabadsCount } = useStoreState((state) => state.navigator);

  return (
    <div className="search-footer">
      <span className="search-footer-span1">Sri Guru Granth Sahib</span>
      <span className="search-footer-span2">Sri Dasam Granth</span>
      <span className="search-footer-span3">Amrit Keertan</span>
      <span className="search-footer-span4">Other</span>
      <span>{searchShabadsCount ? `${searchShabadsCount} Results` : ''}</span>
    </div>
  );
};

export default SearchFooter;
