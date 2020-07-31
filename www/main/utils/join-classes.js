// joining all the classes passed to an array.
const joinClasses = ({ classNames }) => {
  return classNames.filter(cn => !!cn).join(' ');
};

export default joinClasses;
