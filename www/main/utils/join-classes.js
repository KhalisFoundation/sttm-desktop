// joining all the classes passed to an array.
export const joinClasses = ({ classNames }) => {
  return classNames.filter(cn => !!cn).join(' ');
};
