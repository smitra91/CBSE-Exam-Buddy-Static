"use strict";

const $ = (selector) => document.querySelector(selector);
const stopWords = new Set("about after again also because before being between could every explain from have into more most other should their there these they this those through using what when where which with would your define describe selected chapter important".split(" "));
let paper = [];
let timerId;
let secondsLeft = 0;
const selectedChapters = new Set();

function syncChapters() {
  const values = [...selectedChapters];
  $("#topics").value = values.join("; ");
  $("#chapter-summary").textContent = values.length
    ? values.length <= 2
      ? values.join(", ")
      : `${values.length} chapters selected`
    : "Select one or more chapters";
}

$("#chapter-toggle").addEventListener("click", () => {
  const menu = $("#chapter-menu");
  const opening = menu.classList.contains("hidden");
  menu.classList.toggle("hidden");
  $("#chapter-toggle").setAttribute("aria-expanded", String(opening));
});

$("#chapter-menu").addEventListener("change", (event) => {
  if (event.target.matches('input[type="checkbox"]')) {
    event.target.checked
      ? selectedChapters.add(event.target.value)
      : selectedChapters.delete(event.target.value);
    syncChapters();
  }
});

$("#add-chapter").addEventListener("click", () => {
  const input = $("#custom-chapter");
  const value = input.value.trim();
  if (!value) return;
  selectedChapters.add(value);
  const label = document.createElement("label");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.value = value;
  checkbox.checked = true;
  label.append(checkbox, document.createTextNode(value));
  $("#chapter-menu").insertBefore(label, $("#chapter-menu").querySelector(".custom-chapter"));
  input.value = "";
  syncChapters();
});

document.addEventListener("click", (event) => {
  if (!$("#chapter-picker").contains(event.target)) {
    $("#chapter-menu").classList.add("hidden");
    $("#chapter-toggle").setAttribute("aria-expanded", "false");
  }
});

function keywords(text) {
  return [...new Set((text.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []).filter((word) => !stopWords.has(word)))].slice(0, 10);
}

function sentences(text) {
  return text.split(/(?<=[.!?])\s+|\n+/).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 25);
}

function chapterSentences(notes, chapter, allChapters) {
  const lowerNotes = notes.toLowerCase();
  const start = lowerNotes.indexOf(chapter.toLowerCase());
  if (start >= 0) {
    const nextStarts = allChapters.filter((item) => item !== chapter).map((item) => lowerNotes.indexOf(item.toLowerCase(), start + chapter.length)).filter((position) => position > start);
    const end = nextStarts.length ? Math.min(...nextStarts) : Math.min(notes.length, start + 18000);
    const direct = sentences(notes.slice(start, end));
    if (direct.length >= 3) return direct;
  }
  const topicKeys = keywords(chapter);
  const ranked = sentences(notes).map((sentence, index) => ({ sentence, index, score: topicKeys.filter((key) => sentence.toLowerCase().includes(key)).length })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 30).sort((a, b) => a.index - b.index).map((item) => item.sentence);
  return ranked.length >= 3 ? ranked : sentences(notes).slice(0, 30);
}

function blankFact(fact, word) {
  return fact.replace(new RegExp(`\\b${word}\\b`, "i"), "__________");
}

function shuffle(values, seed) {
  const copy = [...values];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = (seed * 17 + i * 13) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildPaper(notes, topicText, count) {
  const topics = topicText.split(/[;\n]+/).map((topic) => topic.trim()).filter(Boolean);
  const corpora = Object.fromEntries(topics.map((topic) => [topic, chapterSentences(notes, topic, topics)]));
  const allTerms = keywords(notes).concat(topics.flatMap(keywords));
  const types = ["mcq", "fill", "truefalse", "definition", "short", "why", "long"];
  return Array.from({ length: count }, (_, index) => {
    const chapter = topics[index % topics.length];
    const corpus = corpora[chapter];
    const offset = Math.floor(index / topics.length);
    const reference = corpus[offset % corpus.length];
    const nextReference = corpus[(offset + 1) % corpus.length];
    const keys = keywords(`${reference} ${nextReference}`);
    const key = keys[0] || keywords(chapter)[0] || "concept";
    const type = types[index % types.length];
    const base = { id: index, chapter, type, reference, keys };
    if (type === "mcq") {
      const distractors = [...new Set(allTerms.filter((term) => term !== key))].slice(index % 5, index % 5 + 3);
      while (distractors.length < 3) distractors.push(["process", "example", "result"][distractors.length]);
      const options = shuffle([key, ...distractors], index + 1);
      return { ...base, marks: 1, question: `Complete this fact from “${chapter}”: ${blankFact(reference, key)}`, options, correct: options.indexOf(key) };
    }
    if (type === "fill") return { ...base, marks: 1, question: `Fill in the blank from “${chapter}”: ${blankFact(reference, key)}`, keys: [key] };
    if (type === "truefalse") return { ...base, marks: 1, question: `True or False: ${reference}`, options: ["True", "False"], correct: 0 };
    if (type === "definition") {
      const match = reference.match(/^(.{3,70}?)\s+(?:is|are|means|refers to)\s+/i);
      return { ...base, marks: 2, question: `Define or explain “${match ? match[1].replace(/^\W+/, "") : key}” as described in “${chapter}”.` };
    }
    if (type === "why") return { ...base, marks: 3, question: `Using “${chapter}”, explain why or how this happens: ${reference}` };
    if (type === "long") return { ...base, marks: 5, question: `Discuss these ideas from “${chapter}” and give an example: ${reference} ${nextReference}`, reference: `${reference} ${nextReference}` };
    return { ...base, marks: 3, question: `Explain this statement from “${chapter}” in your own words: ${reference}` };
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function renderPaper() {
  $("#questions").innerHTML = paper.map((q, index) => `<article class="question"><div class="chapter-tag">${escapeHtml(q.chapter)}</div><h3><span class="question-number">Q${index + 1}.</span> ${escapeHtml(q.question)} <small>(${q.marks} mark${q.marks > 1 ? "s" : ""})</small></h3>${q.options ? q.options.map((option, n) => `<label class="option"><input type="radio" name="q${q.id}" value="${n}">${String.fromCharCode(65+n)}. ${escapeHtml(option)}</label>`).join("") : `<textarea class="answer" id="q${q.id}" placeholder="Write your answer here..."></textarea>`}</article>`).join("");
}

function startTimer(minutes) {
  clearInterval(timerId); secondsLeft = minutes * 60;
  const draw = () => { const m = Math.floor(secondsLeft/60); const s = secondsLeft%60; $("#timer").textContent = `${m}:${String(s).padStart(2,"0")}`; if (secondsLeft-- <= 0) submitExam(); };
  draw(); timerId = setInterval(draw,1000);
}

function grade() {
  return paper.map((q) => {
    if (q.options) { const picked = document.querySelector(`input[name="q${q.id}"]:checked`); const correct = picked && Number(picked.value) === q.correct; return { ...q, awarded:correct ? q.marks : 0, answer:picked ? q.options[Number(picked.value)] : "No answer", message:correct ? "Correct." : `Review the source idea: ${q.reference}` }; }
    const answer = $(`#q${q.id}`).value.trim();
    const answerKeys = new Set(keywords(answer)); const expected = q.keys.slice(0,8); const matches = expected.filter((k) => answerKeys.has(k));
    const coverage = expected.length ? matches.length/expected.length : 0; const detail = Math.min(1,answer.split(/\s+/).filter(Boolean).length/(q.marks*7));
    const awarded = answer ? Math.min(q.marks,Math.round((coverage*.75+detail*.25)*q.marks*2)/2) : 0;
    return { ...q, awarded, answer:answer || "No answer", message:matches.length ? `Recognized concepts: ${matches.join(", ")}.` : "Include more key facts from your notes." };
  });
}

function submitExam() {
  clearInterval(timerId); const results = grade(); const total = results.reduce((n,q)=>n+q.marks,0); const earned = results.reduce((n,q)=>n+q.awarded,0); const pct = Math.round(earned/total*100);
  $("#score").textContent = `${earned}/${total}`; $("#score-message").textContent = pct >= 80 ? "Excellent work!" : pct >= 60 ? "Good progress—review the feedback below." : "Keep practising—you are building the foundation.";
  $("#feedback").innerHTML = results.map((q,i)=>`<article class="result-item ${q.awarded/q.marks >= .6 ? "good" : "improve"}"><h3>Q${i+1}: ${q.awarded}/${q.marks} — ${escapeHtml(q.chapter)}</h3><p>${escapeHtml(q.message)}</p><p class="keywords"><strong>PDF reference:</strong> ${escapeHtml(q.reference)}</p></article>`).join("");
  $("#exam").classList.add("hidden"); $("#results").classList.remove("hidden"); window.scrollTo({top:0,behavior:"smooth"});
}

$("#notes-file").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const status = $("#file-status");
  status.textContent = `Reading ${file.name}...`;
  try {
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      if (!window.extractPdfText) throw new Error("PDF reader is still loading. Please wait a moment and select the file again.");
      const text = await window.extractPdfText(file, (page, total) => { status.textContent = `Reading PDF page ${page} of ${total}...`; });
      if (text.trim().length < 80) throw new Error("Very little selectable text was found. This may be a scanned PDF that requires OCR.");
      $("#notes").value = text;
      status.textContent = `${file.name}: ${text.length.toLocaleString()} characters extracted successfully.`;
    } else {
      $("#notes").value = await file.text();
      status.textContent = `${file.name} loaded successfully.`;
    }
  } catch (error) {
    status.textContent = error.message || "The file could not be read.";
  }
});
$("#setup-form").addEventListener("submit", (event) => { event.preventDefault(); const notes=$("#notes").value.trim(); const topics=$("#topics").value.trim(); if (!notes || !topics) { $("#setup-error").textContent="Please provide topics and study notes."; return; } $("#setup-error").textContent=""; paper=buildPaper(notes,topics,Number($("#question-count").value)); renderPaper(); $("#exam-label").textContent=`${$("#grade").value} • ${$("#subject").value}`; $("#setup").classList.add("hidden"); $("#exam").classList.remove("hidden"); startTimer(Number($("#duration").value)); window.scrollTo({top:0,behavior:"smooth"}); });
$("#submit-exam").addEventListener("click", submitExam);
function reset(){ clearInterval(timerId); paper=[]; $("#exam").classList.add("hidden"); $("#results").classList.add("hidden"); $("#setup").classList.remove("hidden"); window.scrollTo({top:0,behavior:"smooth"}); }
$("#start-over").addEventListener("click",reset); $("#new-paper").addEventListener("click",reset);
