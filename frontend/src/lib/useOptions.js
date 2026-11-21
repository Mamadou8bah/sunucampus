import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

let cache = null;

/** Profile suggestions (programmes, interests, skills, goals), fetched once per session. */
export function useOptions() {
  const [options, setOptions] = useState(cache);

  useEffect(() => {
    if (cache) return;
    api('/meta/options')
      .then((data) => {
        cache = data;
        setOptions(data);
      })
      .catch(() => setOptions({ goals: [], programmes: [], interests: [], skills: [] }));
  }, []);

  return options;
}
