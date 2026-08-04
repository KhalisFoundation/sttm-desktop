/**
 * React 18 asks the test environment to declare itself before `act` will
 * suppress its "not configured to support act(...)" warning. Without this the
 * two suites that render real components print several screens of console noise
 * on every green run, which is how genuine failures get skimmed past.
 */
global.IS_REACT_ACT_ENVIRONMENT = true;
