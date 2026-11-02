import { USER_STORE_API } from '../../../common/constants/api-urls';

const remote = require('@electron/remote');

const analytics = remote.getGlobal('analytics');

// Favourites live in the khalis-user-store (the same API the web apps use). It
// accepts the SSO token the app already keeps.
export const fetchFavShabad = async (userToken) => {
  const response = await fetch(`${USER_STORE_API}/favorite-shabads`, {
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Favourite shabads request failed: ${response.status}`);
  }
  const rows = await response.json();
  // Banis favourited in the web app have no shabadId; only shabads are listed here.
  return rows.filter((row) => row.shabadId != null);
};

export const addToFav = async (shabadId, verseId, userToken) => {
  analytics.trackEvent({
    category: 'Favourite Shabad',
    action: 'Add',
    label: 'shabadId',
    value: shabadId,
  });
  await fetch(`${USER_STORE_API}/favorite-shabads`, {
    method: 'POST',
    body: JSON.stringify({
      shabadId: Number(shabadId),
      ...(verseId ? { verseId: Number(verseId) } : {}),
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
  await fetch(`${USER_STORE_API}/favorite-shabads/${Number(shabadId)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${userToken}`,
    },
  });
};
