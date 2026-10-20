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

  return (
    <>
      <div className="row">
        <button onClick={() => setDate(shiftDate(date, -1))}>‹ Anterior</button>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />
        <button onClick={() => setDate(shiftDate(date, 1))}>Próximo ›</button>
        <button onClick={() => setDate(todayIn(tenant.timezone))}>Hoje</button>
        <span className="muted">
          {formatLongDate(date)} · {active} {active === 1 ? "agendamento" : "agendamentos"}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      {appointments && appointments.length === 0 && <p className="muted">Nenhum agendamento neste dia.</p>}
      {appointments && appointments.length > 0 && (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Cliente</th>
                <th>Telefone</th>
                <th>Serviço</th>
                <th>Profissional</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {appointments.map((a) => (
                <tr key={a.id} className={a.status === "cancelled" ? "inactive" : undefined}>
                  <td>
                    {formatTime(a.startsAt, tenant.timezone)}–{formatTime(a.endsAt, tenant.timezone)}
                  </td>
                  <td>{a.customerName ?? "—"}</td>
                  <td>{formatPhone(a.customerPhone)}</td>
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
    </>
  );
}
