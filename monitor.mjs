// Monitor Detran-RJ: avisa quando "Resende" aparecer em buscar-municipios.
// Env: CPF (obrigatório), NTFY_TOPIC (obrigatório), TEST_FILE (opcional, p/ teste offline)
// Exit: 0 = Resende ausente | 10 = Resende encontrada (avisou) | 1 = erro
import { readFileSync } from "node:fs";

const { CPF, NTFY_TOPIC, TEST_FILE } = process.env;
if (!NTFY_TOPIC || (!CPF && !TEST_FILE)) { console.error("Faltam CPF/NTFY_TOPIC"); process.exit(1); }

const norm = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const PAGE = "https://servicos.detran.rj.gov.br/logincidadao/identificacao-civil/agendamentoMunicipioDic";

async function getList() {
  if (TEST_FILE) return JSON.parse(readFileSync(TEST_FILE, "utf8"));
  const r = await fetch(`https://servicos.detran.rj.gov.br/logincidadao/identificacao-civil/buscar-municipios?cpf=${CPF}&_=${Date.now()}`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

try {
  const j = await getList();
  if (!j.success || !Array.isArray(j.data) || j.data.length === 0) throw new Error("Resposta inesperada: " + JSON.stringify(j).slice(0, 200));
  const hit = j.data.find(m => norm(m.NoMuncipio) === "resende");
  console.log(`${new Date().toISOString()} municípios=${j.data.length} resende=${!!hit}`);
  if (!hit) process.exit(0);
  await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, {
    method: "POST",
    headers: { Title: "RESENDE abriu no Detran!", Priority: "5", Tags: "rotating_light", Click: PAGE },
    body: "Resende apareceu na lista de agendamento do RG. Toque para agendar agora.",
  });
  process.exit(10);
} catch (e) { console.error("ERRO:", e.message); process.exit(1); }
