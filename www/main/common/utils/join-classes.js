// joining all the classes passed to an array.
const joinClasses = (classNames) => classNames.filter((cn) => !!cn).join(' ');

export default joinClasses;
