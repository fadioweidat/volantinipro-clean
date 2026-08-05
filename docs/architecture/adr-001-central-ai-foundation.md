# ADR-001: unico Agent centrale con porte e scope fail-closed

## Stato

Accepted

## Contesto

VolantiniPro richiede una base AI riusabile, con memoria di sessione e accesso rigorosamente autorizzato, senza cambiare il comportamento corrente né collegarsi ora a database, API o motori applicativi.

## Decisione

Adottare un modulo interno al monolite con un solo `CentralAiAgent`, dependency injection per runtime/store/tool, un registry di tool in sola lettura e una policy che deriva gli scope esclusivamente dall'identità autenticata.

## Alternative considerate

| Opzione | Vantaggi | Svantaggi |
|---|---|---|
| Agent separati per area | Autonomia locale | Contesto e policy duplicati; contrario al requisito |
| Agent con accesso diretto ai servizi | Bootstrap rapido | Accoppiamento, difficile audit, rischio di accesso e invenzione dati |
| Agent centrale con porte | Coerenza, testabilità, migrazione graduale | Richiede adapter espliciti per ogni integrazione |

## Conseguenze

- Positivo: permessi, memoria, prompt e grounding hanno una sola fonte di verità.
- Positivo: nessuna regressione funzionale, perché la Foundation non è importata dal runtime corrente.
- Negativo: finché gli adapter non vengono collegati, le richieste dati rispondono “non disponibile”.
- Mitigazione: integrare un tool alla volta con contract test e query già protette da RLS/autorizzazione.

## Trigger di revisione

Rivedere la decisione solo se emergono requisiti reali di scaling indipendente o isolamento infrastrutturale; mantenere comunque un unico contratto logico dell'Agent.

