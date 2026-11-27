"use strict";
// Popote de la coloc : recettes, menu de la semaine partagé, liste de courses.
// L'état partagé vit dans data/etat.json sur la branche "etat" du repo GitHub.
// Lecture publique ; écriture avec une clé GitHub (jeton à droits limités) reçue par lien #cle=...

const DEPOT = "Butoul20/repas-coloc";
const BRANCHE = "etat";
const CHEMIN = "data/etat.json";
const API = `https://api.github.com/repos/${DEPOT}/contents/${CHEMIN}`;
const JOURS = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];
const STATUTS = [
  ["liste", "On compose le menu"],
  ["panier_demande", "Panier Leclerc demandé"],
  ["panier_pret", "Panier prêt, à payer"],
  ["commande", "Commandé"],
];

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const lsGet = (k, d = null) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const lsSet = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} };

let RECETTES = [];
let etat = null, sha = null;
let onglet = "recettes", filtre = "Tout", texte = "", ficheId = null;

// ---------- Clé d'écriture via le lien ----------
(function lireCle() {
  const m = location.hash.match(/cle=([\w-]+)/);
  if (m) { lsSet("popote-cle", m[1]); history.replaceState(null, "", location.pathname); }
})();
const cle = () => lsGet("popote-cle");

// ---------- Accès GitHub ----------
const b64dec = (s) => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), (c) => c.charCodeAt(0)));
const b64enc = (s) => { const o = new TextEncoder().encode(s); let b = ""; o.forEach((x) => (b += String.fromCharCode(x))); return btoa(b); };
const entetes = () => {
  const h = { Accept: "application/vnd.github+json" };
  if (cle()) h.Authorization = `Bearer ${cle()}`;
  return h;
};

async function charger() {
  const r = await fetch(`${API}?ref=${BRANCHE}&t=${Date.now()}`, { headers: entetes(), cache: "no-store" });
  if (r.status === 401 && cle()) { lsSet("popote-cle", null); return charger(); }
  if (!r.ok) throw new Error(`lecture ${r.status}`);
  const j = await r.json();
  sha = j.sha;
  etat = normaliser(JSON.parse(b64dec(j.content)));
}

function normaliser(e) {
  e.repas ??= []; e.courses ??= {}; e.courses.coches ??= {}; e.courses.statut ??= "liste"; e.historique ??= [];
  return e;
}

// Applique une modification : relit la dernière version, modifie, enregistre (réessaie si quelqu'un a écrit entre-temps).
async function modifier(action, message) {
  if (!cle()) { toast("Lecture seule : ouvre le lien avec la clé envoyé par Matthieu."); return; }
  const qui = moi();
  for (let essai = 0; essai < 4; essai++) {
    try {
      await charger();
      action(etat);
      etat.maj = { par: qui, le: new Date().toISOString() };
      const r = await fetch(API, {
        method: "PUT", headers: { ...entetes(), "Content-Type": "application/json" },
        body: JSON.stringify({ message: `${qui} : ${message}`, content: b64enc(JSON.stringify(etat, null, 1) + "\n"), sha, branch: BRANCHE }),
      });
      if (r.status === 409 || r.status === 422) continue;
      if (!r.ok) throw new Error(`écriture ${r.status}`);
      sha = (await r.json()).content.sha;
      afficher();
      return true;
    } catch (err) {
      if (essai === 3) { toast("Pas pu enregistrer (" + err.message + "). Réessaie."); }
    }
  }
  afficher();
}

// ---------- Identité ----------
const moi = () => lsGet("popote-moi") || "Quelqu'un";
function demanderPrenom(force) {
  if (lsGet("popote-moi") && !force) return;
  const d = $("#fenetre");
  d.innerHTML = `<form method="dialog"><h2 style="margin-top:0">Tu es qui ?</h2>
    <p class="doux petit">Pour savoir qui a ajouté quoi au menu.</p>
    <input id="prenom" placeholder="Ton prénom" value="${esc(lsGet("popote-moi") || "")}" autocomplete="given-name" required>
    <button class="bouton">C'est moi</button></form>`;
  d.querySelector("form").onsubmit = () => { const v = $("#prenom").value.trim(); if (v) { lsSet("popote-moi", v); afficher(); } };
  d.showModal();
}

// ---------- Utilitaires ----------
const recette = (id) => RECETTES.find((r) => r.id === id);
function toast(t) {
  const el = document.createElement("div"); el.className = "toast"; el.textContent = t;
  document.body.append(el); setTimeout(() => el.remove(), 2800);
}
function fmtQte(q, u) {
  if (u === "g" && q >= 1000) return `${(Math.round(q / 100) / 10).toLocaleString("fr-FR")} kg`;
  if (u === "ml" && q >= 1000) return `${(Math.round(q / 100) / 10).toLocaleString("fr-FR")} L`;
  let v;
  if (u === "g" || u === "ml") v = q >= 100 ? Math.round(q / 10) * 10 : Math.round(q);
  else v = Math.round(q * 4) / 4;
  const s = v.toLocaleString("fr-FR");
  const pl = v > 1 && ["pièce", "gousse", "tranche", "cube", "bouquet", "pincée"].includes(u) ? "s" : "";
  return `${s} ${u}${pl}`;
}
function listeCourses() {
  const t = new Map();
  for (const rp of etat.repas) {
    const r = recette(rp.recette); if (!r) continue;
    for (const i of r.ingredients) {
      const k = `${i.n}|${i.u}`;
      const e = t.get(k) || { n: i.n, u: i.u, q: 0, placard: !!i.placard, pour: new Set() };
      e.q += i.q * rp.portions; e.pour.add(r.titre); t.set(k, e);
    }
  }
  return [...t.values()].sort((a, b) => a.placard - b.placard || a.n.localeCompare(b.n, "fr"));
}

// ---------- Vues ----------
function afficher() {
  document.querySelectorAll(".onglets button").forEach((b) => b.classList.toggle("actif", b.dataset.onglet === onglet && !ficheId));
  $("#moi").textContent = "👤 " + moi();
  const nb = etat ? etat.repas.length : 0;
  $("#nb-semaine").hidden = !nb; $("#nb-semaine").textContent = nb;
  const band = $("#bandeau");
  band.hidden = !!cle() || !etat;
  band.innerHTML = "👀 Lecture seule. Pour modifier, ouvre le lien d'invitation envoyé par Matthieu.";
  const v = $("#vue");
  if (!etat) { v.innerHTML = `<p class="vide">Chargement…</p>`; return; }
  if (ficheId) return vueFiche(v);
  ({ recettes: vueRecettes, semaine: vueSemaine, courses: vueCourses })[onglet](v);
}

function vueRecettes(v) {
  const tags = ["Tout", ...new Set(["Italien", ...RECETTES.flatMap((r) => r.tags)])];
  const dans = new Set(etat.repas.map((x) => x.recette));
  const liste = RECETTES.filter((r) => (filtre === "Tout" || r.tags.includes(filtre)) &&
    (!texte || (r.titre + " " + r.ingredients.map((i) => i.n).join(" ")).toLowerCase().includes(texte.toLowerCase())));
  v.innerHTML = `<h1>Qu'est-ce qu'on mange ?</h1>
    <input class="recherche" type="search" placeholder="Chercher une recette ou un ingrédient" value="${esc(texte)}">
    <div class="filtres">${tags.map((t) => `<button class="puce ${t === filtre ? "actif" : ""}" data-tag="${esc(t)}">${esc(t)}</button>`).join("")}</div>
    <div class="grille">${liste.map((r) => `
      <div class="carte recette" data-ouvrir="${r.id}" role="button" tabindex="0">
        <img src="${r.photo.url}" alt="" loading="lazy">
        <button class="ajout ${dans.has(r.id) ? "dedans" : ""}" data-ajout="${r.id}" aria-label="Ajouter au menu">${dans.has(r.id) ? "✓" : "+"}</button>
        <div class="corps"><div class="titre">${esc(r.titre)}</div><div class="meta">⏱ ${r.temps} min · ${esc(r.difficulte)}</div></div>
      </div>`).join("") || `<p class="vide">Rien trouvé.</p>`}</div>`;
  const champ = $(".recherche", v);
  champ.oninput = (e) => { texte = e.target.value; const pos = champ.selectionStart; vueRecettes(v); const c = $(".recherche", v); c.focus(); c.setSelectionRange(pos, pos); };
}

function ajouterAuMenu(id) {
  const r = recette(id);
  const deja = etat.repas.filter((x) => x.recette === id).length;
  if (deja && !confirm(`${r.titre} est déjà au menu. L'ajouter une deuxième fois ?`)) return;
  modifier((e) => e.repas.push({ uid: Math.random().toString(36).slice(2, 9), recette: id, portions: 3, par: moi(), jour: "", faite: false, ajoute: new Date().toISOString() }),
    `ajoute ${r.titre}`).then((ok) => ok && toast(`Ajouté au menu : ${r.titre}`));
}

function vueSemaine(v) {
  const repas = [...etat.repas].sort((a, b) => (JOURS.indexOf(a.jour) + 1 || 9) - (JOURS.indexOf(b.jour) + 1 || 9));
  const faites = repas.filter((x) => x.faite).length;
  v.innerHTML = `<h1>Le menu de la semaine</h1>
    ${repas.length ? `<p class="doux petit">${repas.length} repas · ${faites} fait${faites > 1 ? "s" : ""}</p>` : ""}
    ${repas.map((x) => { const r = recette(x.recette); if (!r) return ""; return `
      <div class="carte repas ${x.faite ? "faite" : ""}">
        <img src="${r.photo.url}" alt="" data-ouvrir="${r.id}" data-uid="${x.uid}">
        <div class="infos">
          <div class="titre" data-ouvrir="${r.id}" data-uid="${x.uid}">${esc(r.titre)}</div>
          <div class="doux petit">Proposé par ${esc(x.par)}${x.faite ? ` · ✅ fait${x.faitePar ? " par " + esc(x.faitePar) : ""}` : ""}</div>
          <div class="ligne-actions">
            <select class="mini" data-jour="${x.uid}"><option value="">Jour ?</option>${JOURS.map((j) => `<option ${j === x.jour ? "selected" : ""}>${j}</option>`).join("")}</select>
            <span class="compteur"><button data-moins="${x.uid}">−</button><span>${x.portions} pers.</span><button data-plus="${x.uid}">+</button></span>
            <button class="mini" data-faite="${x.uid}">${x.faite ? "↩︎" : "✅ Fait"}</button>
            <button class="mini" data-retirer="${x.uid}" aria-label="Retirer">🗑</button>
          </div>
        </div>
      </div>`; }).join("") || `<div class="vide"><p>Le menu est vide.</p><button class="bouton" data-aller="recettes">Choisir des recettes</button></div>`}
    ${repas.length ? `<button class="bouton" data-aller="courses">Voir la liste de courses</button>
      <button class="bouton second" data-nouvelle>Nouvelle semaine (vider le menu)</button>` : ""}`;
}

function vueCourses(v) {
  const l = listeCourses();
  const c = etat.courses;
  const iStatut = STATUTS.findIndex((s) => s[0] === c.statut);
  const achat = l.filter((i) => !i.placard), placard = l.filter((i) => i.placard);
  const ligne = (i) => { const k = `${i.n}|${i.u}`; return `<label class="article ${c.coches[k] ? "coche" : ""}">
      <input type="checkbox" data-coche="${esc(k)}" ${c.coches[k] ? "checked" : ""}>
      <span class="nom">${esc(i.n)}<br><span class="doux petit">${esc([...i.pour].join(", "))}</span></span>
      <span class="qte">${fmtQte(i.q, i.u)}</span></label>`; };
  v.innerHTML = `<h1>Les courses</h1>
    <div class="carte statut">
      <b>${esc(STATUTS[iStatut][1])}</b>
      ${c.note ? `<div class="petit" style="margin-top:4px;white-space:pre-line">${esc(c.note)}</div>` : ""}
      <div class="etapes-statut">${STATUTS.map((_, i) => `<i class="${i <= iStatut ? "ok" : ""}"></i>`).join("")}</div>
    </div>
    ${!l.length ? `<p class="vide">Ajoute des repas au menu pour générer la liste.</p>` : `
    ${c.statut === "liste" ? `<button class="bouton orange" data-statut="panier_demande">🛒 Demander le panier Leclerc Drive</button>
      <p class="doux petit">Coche avant ce qu'on a déjà à l'appart : ce ne sera pas commandé.</p>` : ""}
    ${c.statut === "panier_demande" ? `<p class="doux petit">Liste figée. Matthieu demande à Claude de remplir le panier Leclerc Drive (Voltaire) avec les articles non cochés, puis il valide et paie.</p>` : ""}
    ${c.statut === "panier_pret" ? `<button class="bouton" data-statut="commande">✅ C'est commandé</button>` : ""}
    <h2>À acheter (${achat.length})</h2>
    <div class="carte">${achat.map(ligne).join("")}</div>
    ${placard.length ? `<h2>Placard <span class="doux petit">(à vérifier)</span></h2><div class="carte">${placard.map(ligne).join("")}</div>` : ""}
    ${c.statut !== "liste" ? `<button class="bouton second" data-statut="liste">Revenir au menu (modifier la liste)</button>` : ""}`}`;
}

function vueFiche(v) {
  const r = recette(ficheId);
  const rp = etat.repas.find((x) => x.uid === ficheUid) || etat.repas.find((x) => x.recette === r.id && !x.faite);
  const portions = rp ? rp.portions : Number(lsGet("popote-portions", 3));
  const fait = JSON.parse(lsGet("popote-etapes-" + r.id, "[]"));
  v.innerHTML = `
    <div class="fiche-photo"><img src="${r.photo.url}" alt="${esc(r.titre)}">
      <button class="retour" data-retour>← Retour</button>
      <a class="credit" href="${esc(r.photo.page)}" target="_blank" rel="noopener">📷 ${esc(r.photo.credit)}</a></div>
    <h1 style="margin-top:14px">${esc(r.titre)}</h1>
    <div class="badges"><span class="badge">⏱ ${r.temps} min</span><span class="badge">${esc(r.difficulte)}</span>${r.tags.map((t) => `<span class="badge">${esc(t)}</span>`).join("")}</div>
    ${rp ? `<button class="bouton ${rp.faite ? "second" : ""}" data-faite="${rp.uid}">${rp.faite ? "↩︎ Pas encore faite" : "✅ Marquer comme faite"}</button>`
         : `<button class="bouton" data-ajout="${r.id}">+ Ajouter au menu</button>`}
    <h2>Ingrédients <span class="doux petit">pour ${portions} pers.</span></h2>
    <div class="carte ingr">${r.ingredients.map((i) => `<div class="article"><span class="nom">${esc(i.n)}${i.placard ? ' <span class="doux petit">(placard)</span>' : ""}</span><span class="qte">${fmtQte(i.q * portions, i.u)}</span></div>`).join("")}</div>
    <h2>Étapes <span class="doux petit">touche une étape quand elle est faite</span></h2>
    ${r.etapes.map((e, n) => `<button class="carte etape ${fait.includes(n) ? "ok" : ""}" data-etape="${n}"><b>${n + 1}</b><span>${esc(e)}</span></button>`).join("")}
    ${fait.length ? `<button class="bouton second" data-raz-etapes>Remettre les étapes à zéro</button>` : ""}`;
  window.scrollTo(0, 0);
}
let ficheUid = null;

// ---------- Événements ----------
document.addEventListener("click", (ev) => {
  const t = ev.target.closest("button, [data-ouvrir], [data-aller]");
  if (!t) return;
  const d = t.dataset;
  if (t.closest(".onglets")) { onglet = d.onglet; ficheId = null; afficher(); window.scrollTo(0, 0); return; }
  if (t.id === "moi") return demanderPrenom(true);
  if (d.ajout) { ev.stopPropagation(); return ajouterAuMenu(d.ajout); }
  if (d.tag) { filtre = d.tag; return afficher(); }
  if (d.aller) { onglet = d.aller; ficheId = null; return afficher(); }
  if (d.ouvrir) { ficheId = d.ouvrir; ficheUid = d.uid || null; return afficher(); }
  if ("retour" in d) { ficheId = null; return afficher(); }
  if (d.etape) {
    const k = "popote-etapes-" + ficheId, f = new Set(JSON.parse(lsGet(k, "[]"))), n = Number(d.etape);
    f.has(n) ? f.delete(n) : f.add(n); lsSet(k, JSON.stringify([...f])); return afficher();
  }
  if ("razEtapes" in d) { lsSet("popote-etapes-" + ficheId, null); return afficher(); }
  const repas = (uid, fn) => (e) => { const x = e.repas.find((y) => y.uid === uid); if (x) fn(x, e); };
  const nomRepas = (uid) => recette(etat.repas.find((y) => y.uid === uid)?.recette)?.titre || "repas";
  if (d.plus) return modifier(repas(d.plus, (x) => (x.portions = Math.min(12, x.portions + 1))), `portions ${nomRepas(d.plus)}`);
  if (d.moins) return modifier(repas(d.moins, (x) => (x.portions = Math.max(1, x.portions - 1))), `portions ${nomRepas(d.moins)}`);
  if (d.faite) return modifier(repas(d.faite, (x, e) => {
    x.faite = !x.faite; x.faitePar = x.faite ? moi() : undefined;
    if (x.faite) e.historique.push({ recette: x.recette, le: new Date().toISOString().slice(0, 10), par: moi() });
  }), `${nomRepas(d.faite)} faite`);
  if (d.retirer) { if (!confirm(`Retirer « ${nomRepas(d.retirer)} » du menu ?`)) return;
    return modifier((e) => (e.repas = e.repas.filter((y) => y.uid !== d.retirer)), `retire ${nomRepas(d.retirer)}`); }
  if (d.statut) {
    if (d.statut === "panier_demande" && !confirm("Figer la liste pour le panier Leclerc Drive ? (Matthieu le fera remplir par Claude)")) return;
    return modifier((e) => { e.courses.statut = d.statut; if (d.statut === "liste") e.courses.note = ""; }, `statut ${d.statut}`);
  }
  if ("nouvelle" in d) { if (!confirm("Vider le menu et la liste pour une nouvelle semaine ?")) return;
    return modifier((e) => { e.repas = []; e.courses = { coches: {}, statut: "liste" }; }, "nouvelle semaine"); }
});
document.addEventListener("change", (ev) => {
  const d = ev.target.dataset;
  if (d.jour) modifier((e) => { const x = e.repas.find((y) => y.uid === d.jour); if (x) x.jour = ev.target.value; }, `jour ${ev.target.value}`);
  if (d.coche) modifier((e) => { e.courses.coches[d.coche] = ev.target.checked || undefined; }, `coche ${d.coche.split("|")[0]}`);
});
document.addEventListener("keydown", (ev) => { if (ev.key === "Enter" && ev.target.dataset?.ouvrir) ev.target.click(); });

// ---------- Démarrage ----------
async function rafraichir() {
  if (document.hidden) return;
  try { const avant = sha; await charger(); if (sha !== avant) afficher(); } catch {}
}
(async () => {
  afficher();
  RECETTES = await (await fetch("data/recettes.json")).json();
  try { await charger(); } catch (e) { $("#vue").innerHTML = `<p class="vide">Impossible de charger le menu (${esc(e.message)}). Réessaie dans un instant.</p>`; return; }
  afficher();
  demanderPrenom(false);
  setInterval(rafraichir, cle() ? 20000 : 90000);
  document.addEventListener("visibilitychange", rafraichir);
})();
