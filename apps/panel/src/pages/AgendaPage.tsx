import { useCallback, useEffect, useState } from "react";
import { api, type Appointment, type AppointmentStatus, type Tenant } from "../api";
import { formatLongDate, formatPhone, formatTime, shiftDate, STATUS_LABELS, todayIn } from "../format";

export function AgendaPage({ tenant }: { tenant: Tenant }) {
  const [date, setDate] = useState(() => todayIn(tenant.timezone));
  const [appointments, setAppointments] = useState<Appointment[] | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setAppointments(await api<Appointment[]>(`/tenants/${tenant.id}/appointments?date=${date}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [tenant.id, date]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(appointment: Appointment, status: AppointmentStatus) {
    setError("");
    try {
      await api(`/tenants/${tenant.id}/appointments/${appointment.id}`, { method: "PATCH", body: { status } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const active = appointments?.filter((a) => a.status !== "cancelled").length ?? 0;
  const today = todayIn(tenant.timezone);

  return (
    <div className="panel">
      <div className="toolbar">
        <button onClick={() => setDate(shiftDate(date, -1))} aria-label="Dia anterior">
          ‹
        </button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button onClick={() => setDate(shiftDate(date, 1))} aria-label="Próximo dia">
          ›
        </button>
        <button onClick={() => setDate(today)} disabled={date === today}>
          Hoje
        </button>
        <span className="spacer" />
        <span className="muted">
          <span style={{ textTransform: "capitalize" }}>{formatLongDate(date)}</span> · {active}{" "}
          {active === 1 ? "agendamento" : "agendamentos"}
        </span>
      </div>
      {error && <p className="error panel-body">{error}</p>}

      {appointments && appointments.length === 0 && <div className="empty">Nenhum agendamento neste dia.</div>}
      {appointments && appointments.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Cliente</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className={a.status === "cancelled" ? "inactive" : undefined}>
                  <td>
                    <strong>{formatTime(a.startsAt, tenant.timezone)}</strong>
                    <span className="cell-sub">até {formatTime(a.endsAt, tenant.timezone)}</span>
                  </td>
                  <td>
                    {a.customerName ?? "Sem nome"}
                    <span className="cell-sub">{formatPhone(a.customerPhone)}</span>
                  </td>
                  <td>{a.serviceName}</td>
                  <td>{a.professionalName}</td>
                  <td>
                    <select value={a.status} onChange={(e) => changeStatus(a, e.target.value as AppointmentStatus)}>
                      {Object.entries(STATUS_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
