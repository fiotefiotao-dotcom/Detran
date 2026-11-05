// Monitor Detran-RJ: avisa quando alguma cidade de CIDADES aparecer em buscar-municipios.
// Env: CPF e NTFY_TOPIC (obrigatórios), TEST_FILE (opcional, teste offline)
// Exit: 0 = nenhuma cidade | 10 = encontrou (avisou; o workflow se desliga) | 1 = erro
import { readFileSync } from "node:fs";

const { CPF, NTFY_TOPIC, TEST_FILE, GITHUB_EVENT_NAME } = process.env;
if (!NTFY_TOPIC || (!CPF && !TEST_FILE)) { console.error("Faltam CPF/NTFY_TOPIC"); process.exit(1); }

const CIDADES = ["resende", "barra mansa", "volta redonda", "itatiaia", "porto real"];
const norm = s => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").trim().toLowerCase();
const PAGE = "https://servicos.detran.rj.gov.br/logincidadao/identificacao-civil/agendamento";

async function getList() {
  if (TEST_FILE) return JSON.parse(readFileSync(TEST_FILE, "utf8"));
  const r = await fetch(`https://servicos.detran.rj.gov.br/logincidadao/identificacao-civil/buscar-municipios?cpf=${CPF}&_=${Date.now()}`,
    { headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function ntfy(headers, body) {
  const r = await fetch(`https://ntfy.sh/${NTFY_TOPIC}`, { method: "POST", headers, body });
  if (!r.ok) throw new Error(`ntfy HTTP ${r.status}`);
}

try {
  const j = await getList();
  if (!j.success || !Array.isArray(j.data) || j.data.length === 0) throw new Error("Resposta inesperada: " + JSON.stringify(j).slice(0, 200));
  const hits = j.data.filter(m => CIDADES.includes(norm(m.NoMuncipio))).map(m => m.NoMuncipio.trim());
  console.log(`${new Date().toISOString()} municípios=${j.data.length} encontradas=[${hits.join(", ")}]`);

  if (hits.length) {
    await ntfy({ Title: `Detran RG: ${hits.join(", ")}`, Priority: "5", Tags: "rotating_light", Click: PAGE },
      `Apareceu na lista de agendamento do RG: ${hits.join(", ")} (${j.data.length} municípios). Toque para agendar.`);
    process.exit(10);
  }else
  {
     await ntfy({ Title: `Detran RG: ${hits.join(", ")}`, Priority: "5", Tags: "rotating_light", Click: PAGE },
      `Ainda nada!!!`);
    process.exit(10);
  }
  // Só em execução manual (Run workflow): aviso discreto para confirmar que o celular recebe.
  if (GITHUB_EVENT_NAME === "workflow_dispatch" || TEST_FILE)
    await ntfy({ Title: "Monitor ativo", Priority: "2", Tags: "white_check_mark" }, `Nenhuma cidade ainda (${j.data.length} municípios).`);
  process.exit(0);
} catch (e) { console.error("ERRO:", e.message); process.exit(1); }
