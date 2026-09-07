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

function buildPaper(notes, topicText, count) {
  const source = sentences(notes);
  const topics = topicText.split(/[;,\n]+/).map((t) => t.trim()).filter(Boolean);
  const pool = source.length ? source : topics;
  return Array.from({ length: count }, (_, i) => {
    const reference = pool[i % pool.length];
    const topic = topics[i % topics.length] || keywords(reference).slice(0, 2).join(" ") || "the topic";
    const keys = keywords(reference);
    const type = i % 5 === 0 ? "mcq" : i % 3 === 0 ? "long" : "short";
    if (type === "mcq") {
      const correct = keys[0] || topic;
      return { id:i, type, marks:1, question:`Which term is most closely connected with ${topic}?`, options:[correct,`not ${correct}`,"none of these","all of these"], correct:0, reference, keys };
    }
    const marks = type === "long" ? 5 : 3;
    return { id:i, type, marks, question:type === "long" ? `Explain ${topic} in detail and include an example.` : `Describe the main ideas related to ${topic}.`, reference, keys };
  });
}

function renderPaper() {
  $("#questions").innerHTML = paper.map((q, index) => `<article class="question"><h3><span class="question-number">Q${index + 1}.</span> ${q.question} <small>(${q.marks} mark${q.marks > 1 ? "s" : ""})</small></h3>${q.type === "mcq" ? q.options.map((option, n) => `<label class="option"><input type="radio" name="q${q.id}" value="${n}">${String.fromCharCode(65+n)}. ${option}</label>`).join("") : `<textarea class="answer" id="q${q.id}" placeholder="Write your answer here..."></textarea>`}</article>`).join("");
}

function startTimer(minutes) {
  clearInterval(timerId); secondsLeft = minutes * 60;
  const draw = () => { const m = Math.floor(secondsLeft/60); const s = secondsLeft%60; $("#timer").textContent = `${m}:${String(s).padStart(2,"0")}`; if (secondsLeft-- <= 0) submitExam(); };
  draw(); timerId = setInterval(draw,1000);
}

function grade() {
  return paper.map((q) => {
    if (q.type === "mcq") { const picked = document.querySelector(`input[name="q${q.id}"]:checked`); const correct = picked && Number(picked.value) === q.correct; return { ...q, awarded:correct ? q.marks : 0, answer:picked ? q.options[Number(picked.value)] : "No answer", message:correct ? "Correct." : `Review the source idea: ${q.reference}` }; }
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
  $("#feedback").innerHTML = results.map((q,i)=>`<article class="result-item ${q.awarded/q.marks >= .6 ? "good" : "improve"}"><h3>Q${i+1}: ${q.awarded}/${q.marks}</h3><p>${q.message}</p><p class="keywords"><strong>Reference:</strong> ${q.reference}</p></article>`).join("");
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
