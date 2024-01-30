import { SP_API } from '../../../common/constants/api-urls';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

export const fetchFavShabad = async (userToken) => {
  const response = await fetch(`${SP_API}/favourite-shabads`, {
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });
  return response.json().then((data) => data.favouriteShabads);
};

export const addToFav = async (shabadId, verseId, userToken) => {
  analytics.trackEvent({
    category: 'Favourite Shabad',
    action: 'Add',
    label: 'shabadId',
    value: shabadId,
  });
  await fetch(`${SP_API}/favourite-shabads`, {
    method: 'POST',
    body: JSON.stringify({
      shabadId,
      verseId,
    }),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${userToken}`,
    },
  });
};

export const removeFromFav = async (shabadId, userToken) => {
  analytics.trackEvent({
    category: 'Favourite Shabad',
    action: 'Remove',
    label: 'shabadId',
    value: shabadId,
  });
  await fetch(`${SP_API}/favourite-shabads/${shabadId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });
};
