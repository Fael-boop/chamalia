import { useEffect, useState } from "react";
import { api, type BusinessHour, type Tenant } from "../api";
import { WEEKDAYS } from "../format";

type Period = { opensAt: string; closesAt: string };

export function HoursPage({ tenant }: { tenant: Tenant }) {
  const [days, setDays] = useState<Period[][]>(() => WEEKDAYS.map(() => []));
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api<BusinessHour[]>(`/tenants/${tenant.id}/business-hours`)
      .then((rows) =>
        setDays(
          WEEKDAYS.map((_, weekday) =>
            rows.filter((row) => row.weekday === weekday).map(({ opensAt, closesAt }) => ({ opensAt, closesAt })),
          ),
        ),
      )
      .catch((e: Error) => setError(e.message));
  }, [tenant.id]);

  function update(weekday: number, periods: Period[]) {
    setDays(days.map((current, index) => (index === weekday ? periods : current)));
    setStatus("");
  }

  async function save() {
    setError("");
    setStatus("");
    try {
      const body = days.flatMap((periods, weekday) => periods.map((period) => ({ weekday, ...period })));
      await api(`/tenants/${tenant.id}/business-hours`, { method: "PUT", body });
      setStatus("Horários salvos.");
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      <p className="hint">Para intervalo de almoço, use dois períodos no mesmo dia (ex.: 09:00–12:00 e 13:00–19:00).</p>
      <div className="panel">
      <table>
        <tbody>
          {days.map((periods, weekday) => (
            <tr key={weekday}>
              <td style={{ width: 120, fontWeight: 500 }}>{WEEKDAYS[weekday]}</td>
              <td>
                <div className="row">
                  {periods.length === 0 && <span className="muted">Fechado</span>}
                  {periods.map((period, index) => (
                    <span key={index} className="row">
                      <input
                        type="time"
                        value={period.opensAt}
                        onChange={(e) =>
                          update(weekday, periods.map((p, i) => (i === index ? { ...p, opensAt: e.target.value } : p)))
                        }
                      />
                      –
                      <input
                        type="time"
                        value={period.closesAt}
                        onChange={(e) =>
                          update(weekday, periods.map((p, i) => (i === index ? { ...p, closesAt: e.target.value } : p)))
                        }
                      />
                      <button
                        className="small"
                        title="Remover período"
                        onClick={() => update(weekday, periods.filter((_, i) => i !== index))}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <button
                    className="small"
                    onClick={() =>
                      update(weekday, [
                        ...periods,
                        periods.length ? { opensAt: "13:00", closesAt: "18:00" } : { opensAt: "09:00", closesAt: "18:00" },
                      ])
                    }
                  >
                    + período
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="panel-footer">
        <button className="primary" onClick={save}>
          Salvar horários
        </button>
        {status && <span className="muted">{status}</span>}
        {error && <span className="error">{error}</span>}
      </div>
      </div>
    </>
  );
}
