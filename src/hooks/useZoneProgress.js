import { useCallback, useEffect, useReducer, useRef } from 'react';
import { zoneProgressClient } from '../lib/services/zone-progress-api.js';

export const initialZoneProgressState = {
  loading: true,
  refreshing: false,
  mutatingZoneId: null,
  zones: [],
  history: [],
  error: null,
  notice: '',
};

export function zoneProgressReducer(state, action) {
  switch (action.type) {
    case 'load_started':
      return {
        ...state,
        loading: state.zones.length === 0,
        refreshing: state.zones.length > 0,
        error: null,
      };
    case 'load_succeeded':
      return {
        ...state,
        loading: false,
        refreshing: false,
        zones: action.zones,
        history: action.history,
        // Le zone (dato primario) restano valide anche se lo storico
        // (secondario) e' fallito — l'errore, se presente, resta visibile
        // nel banner senza nascondere le card zona gia' caricate.
        error: action.error || null,
      };
    case 'load_failed':
      return {
        ...state,
        loading: false,
        refreshing: false,
        error: action.error,
      };
    case 'mutation_started':
      return {
        ...state,
        mutatingZoneId: action.zoneId,
        error: null,
        notice: '',
      };
    case 'mutation_succeeded':
      return {
        ...state,
        mutatingZoneId: null,
        notice: action.notice,
        error: null,
      };
    case 'mutation_failed':
      return {
        ...state,
        mutatingZoneId: null,
        error: action.error,
      };
    case 'clear_notice':
      return { ...state, notice: '' };
    default:
      return state;
  }
}

export function useZoneProgress({
  campaignId,
  includeHistory = false,
  client = zoneProgressClient,
} = {}) {
  const [state, dispatch] = useReducer(zoneProgressReducer, initialZoneProgressState);
  const requestIdRef = useRef(0);
  const mutationInFlightRef = useRef(false);
  const mountedRef = useRef(false);
  const campaignIdRef = useRef(campaignId);
  campaignIdRef.current = campaignId;

  const refresh = useCallback(async ({ rethrow = false } = {}) => {
    const requestId = ++requestIdRef.current;
    dispatch({ type: 'load_started' });
    try {
      // P0: zone e storico venivano risolti con un solo Promise.all — un
      // problema isolato nello storico (es. una riga con event_type non
      // ancora riconosciuto) rigettava l'intero Promise.all e buttava via
      // anche le zone gia' recuperate correttamente, mostrando "Nessuna zona
      // configurata" anche quando le zone esistevano davvero (riprodotto dal
      // vivo). Le zone sono il dato primario del pannello: un fallimento
      // dello storico (secondario, solo Admin) non deve mai nasconderle.
      const zones = await client.getCampaignZoneProgress(campaignId);
      let history = [];
      let historyError = null;
      if (includeHistory) {
        try {
          history = await client.getCampaignZoneProgressHistory(campaignId);
        } catch (error) {
          historyError = error;
        }
      }
      if (!mountedRef.current || requestId !== requestIdRef.current) return null;
      dispatch({ type: 'load_succeeded', zones, history, error: historyError });
      if (rethrow && historyError) throw historyError;
      return { zones, history };
    } catch (error) {
      if (!mountedRef.current || requestId !== requestIdRef.current) return null;
      dispatch({ type: 'load_failed', error });
      if (rethrow) throw error;
      return null;
    }
  }, [campaignId, client, includeHistory]);

  const setManualProgress = useCallback(async (zoneId, percent, reason) => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    const operationCampaignId = campaignId;
    dispatch({ type: 'mutation_started', zoneId });
    try {
      await client.setZoneManualProgress(zoneId, percent, reason);
      if (!mountedRef.current || campaignIdRef.current !== operationCampaignId) return true;
      dispatch({
        type: 'mutation_succeeded',
        notice: 'Override manuale salvato.',
      });
      await refresh();
      return true;
    } catch (error) {
      if (mountedRef.current && campaignIdRef.current === operationCampaignId) {
        dispatch({ type: 'mutation_failed', error });
      }
      return false;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [campaignId, client, refresh]);

  const clearManualProgress = useCallback(async (zoneId, reason) => {
    if (mutationInFlightRef.current) return false;
    mutationInFlightRef.current = true;
    const operationCampaignId = campaignId;
    dispatch({ type: 'mutation_started', zoneId });
    try {
      await client.clearZoneManualProgress(zoneId, reason);
      if (!mountedRef.current || campaignIdRef.current !== operationCampaignId) return true;
      dispatch({
        type: 'mutation_succeeded',
        notice: 'Override manuale rimosso.',
      });
      await refresh();
      return true;
    } catch (error) {
      if (mountedRef.current && campaignIdRef.current === operationCampaignId) {
        dispatch({ type: 'mutation_failed', error });
      }
      return false;
    } finally {
      mutationInFlightRef.current = false;
    }
  }, [campaignId, client, refresh]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!campaignId) {
      dispatch({
        type: 'load_failed',
        error: new Error('Campagna non disponibile.'),
      });
      return undefined;
    }
    refresh();
    return () => {
      requestIdRef.current += 1;
    };
  }, [campaignId, refresh]);

  return {
    ...state,
    isEmpty: !state.loading && !state.error && state.zones.length === 0,
    refresh,
    setManualProgress,
    clearManualProgress,
    clearNotice: () => dispatch({ type: 'clear_notice' }),
  };
}
