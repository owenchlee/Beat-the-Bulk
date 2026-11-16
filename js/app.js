/* ============================================================
   BEAT THE BULK — App orchestration
   ============================================================ */
(function () {
  /** @param {string} id @returns {HTMLElement} */
  const $ = id => /** @type {HTMLElement} */ (document.getElementById(id));
  const store = new BTB.Store();
  const audio = BTB.Audio;
  const voice = BTB.Voice;

  /** @type {any} */
  let character;
  /** @type {any} */
  let tracker;
  let selectedGoal = store.state.goal || 'weight_loss';
  let selectedIntensity = store.state.intensity || 'moderate';
  /** @type {any} */
  let session = null; // active workout session
  /** @type {any} */
  let demoAnimTimer = null;
  let lastBubbleType = '';
  let resetArmed = false;

  const MILESTONE_COUNT = 5;

  // ---------------------------------------------------------------
  // Static icon/label injection (SVG icons, not emoji, per style guide)
  // ---------------------------------------------------------------
  /** @param {string} id @param {string} iconName @param {string} text */
  function label(id, iconName, text) {
    const el = $(id);
    if (!el) return;
    el.innerHTML = (iconName ? BTB.icon(iconName, 18) : '') + `<span>${text}</span>`;
  }

  function initStaticLabels() {
    label('tabBtn-workout', 'dumbbell', 'Workout');
    label('tabBtn-progress', 'chart', 'Progress');
    label('tabBtn-character', 'user', 'Character');
    label('tabBtn-settings', 'sliders', 'Settings');
    label('setupTitle', 'bolt', 'Start a Workout');
    label('beginWorkoutBtn', 'play', 'Begin Workout');
    label('queueTitle', 'check', "Today's Circuit");
    label('progressChartTitle', 'chart', 'Weight Journey');
    label('weeklyChartTitle', 'calendar', "This Week's Reps");
    label('historyTitle', 'clock', 'Workout History');
    label('milestoneTitle', 'trophy', 'Milestones');
    label('achievementsTitle', 'sparkle', 'Achievements');
    label('audioSettingsTitle', 'volume', 'Audio');
    label('voiceSettingsTitle', 'sparkle', 'Voice Coaching');
    label('goalSettingsTitle', 'target', 'Goal');
    label('dataSettingsTitle', 'scale', 'Your Data');
    label('resetBtn', 'x', 'Reset All Progress');
    $('muteBtn').innerHTML = BTB.icon('volume', 18);
    $('muteBtn').setAttribute('aria-label', 'Mute audio');
  }

  // ---------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------
  /** @param {string} msg */
  function toast(msg) {
    const stack = $('toastStack');
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = BTB.icon('check', 16) + `<span>${msg}</span>`;
    stack.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, 3200);
  }

  function launchConfetti() {
    const colors = ['#f97316', '#22c55e', '#38bdf8', '#a78bfa', '#fbbf24'];
    for (let i = 0; i < 70; i++) {
      setTimeout(() => {
        const el = document.createElement('div');
        el.className = 'confetti-p';
        el.style.cssText = `left:${Math.random() * 100}vw;top:-10px;background:${colors[~~(Math.random() * colors.length)]};animation-duration:${1.4 + Math.random() * 2}s;animation-delay:${Math.random() * 0.3}s;width:${6 + Math.random() * 8}px;height:${6 + Math.random() * 8}px;border-radius:${Math.random() > 0.5 ? '50%' : '2px'}`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 4200);
      }, i * 32);
    }
  }

  // ---------------------------------------------------------------
  // Bubble / mood copy
  // ---------------------------------------------------------------
  const MSGS = {
    lazy: ["Ugh... do we have to? 😩", "The couch is calling my name...", "One more minute of rest? Please?"],
    fit: ["I feel unstoppable right now.", "Look at this energy!", "We make a great team."],
    start: ["Let's get after it!", "Okay, I'm ready — bring it on.", "Time to earn today's progress."],
    working: ["Huff... puff... keep going!", "Feeling it now!", "Don't stop, we've got this!", "This is the hard part — push through!"],
    setDone: ["Nice! One down.", "That's how it's done.", "On to the next one!"],
    workoutDone: ["WE DID IT! Incredible work.", "Look at that progress!", "Best session yet."],
    eatGood: ["Good call — fuel that matters.", "Smart choice!", "That'll keep us on track."],
    eatBad: ["Worth it... probably.", "We'll work it off next time.", "No regrets. Mostly."],
    milestone: ["Whoa — new milestone unlocked!", "We just hit a big goal!", "Look how far we've come!"]
  };
  /** @param {keyof typeof MSGS} type @param {boolean} [speakToo] */
  function setBubble(type, speakToo) {
    if (type === lastBubbleType && type !== 'working') return;
    lastBubbleType = type;
    const opts = MSGS[type] || MSGS.start;
    const line = opts[Math.floor(Math.random() * opts.length)];
    $('bubble').textContent = line;
    if (speakToo) voice.speak(line);
  }

  // ---------------------------------------------------------------
  // Character / weight sync
  // ---------------------------------------------------------------
  function fitnessT() {
    const span = store.state.startWeight - store.state.goalWeight;
    if (span <= 0) return 1;
    return Math.max(0, Math.min(1, (store.state.startWeight - store.state.weight) / span));
  }
  /** @param {number} t */
  function stageName(t) {
    if (t < 0.15) return 'Getting Started';
    if (t < 0.4) return 'Building Momentum';
    if (t < 0.65) return 'Getting Stronger';
    if (t < 0.9) return 'Athletic';
    return 'Peak Shape';
  }
  function milestoneThresholds() {
    const span = store.state.startWeight - store.state.goalWeight;
    const out = [];
    for (let i = 1; i <= MILESTONE_COUNT; i++) out.push(store.state.startWeight - span * (i / MILESTONE_COUNT));
    return out;
  }
  function buildMilestonesUI() {
    const el = $('milestones');
    el.innerHTML = '';
    milestoneThresholds().forEach((m, i) => {
      const reached = store.state.weight <= m + 0.05;
      const d = document.createElement('div');
      d.className = 'mstone';
      d.innerHTML = `<div class="mstone-dot ${reached ? 'reached' : ''}">${BTB.icon('check', 10)}</div><div class="mstone-lbl">${Math.round(m)}</div>`;
      el.appendChild(d);
    });
  }
  function checkMilestoneCrossing() {
    const reachedCount = milestoneThresholds().filter(m => store.state.weight <= m + 0.05).length;
    if (reachedCount > (store.state.milestonesReached || 0)) {
      store.state.milestonesReached = reachedCount;
      audio.play('milestone');
      character.showSparkle(true);
      setTimeout(() => { if (!session || session.phase !== 'done') character.showSparkle(false); }, 1600);
      toast('Milestone reached! Keep going.');
      setBubble('milestone', true);
    }
  }

  function checkAchievements() {
    const newly = BTB.evaluateAchievements(store, session);
    if (!newly.length) return;
    audio.play('milestone');
    character.showSparkle(true);
    setTimeout(() => { if (!session || session.phase !== 'done') character.showSparkle(false); }, 1600);
    newly.forEach((/** @type {any} */ a) => toast(`Achievement unlocked: ${a.name}`));
    setBubble('milestone', true);
  }

  /** @param {string} [moodOverride] */
  function refreshCharacterUI(moodOverride) {
    const t = fitnessT();
    character.update({ t });
    $('weightNow').textContent = String(Math.round(store.state.weight));
    $('weightGoalSub').textContent = store.state.goalWeight + ' lbs';
    $('goalChipVal').textContent = store.state.goalWeight + ' lbs';
    $('progFill').style.width = Math.round(t * 100) + '%';
    $('progLabel').textContent = `Journey: ${Math.round(t * 100)}% complete`;
    $('charStageName').textContent = stageName(t);
    $('charNameDisplay').textContent = store.state.name;
    $('streakChip').innerHTML = BTB.icon('flame', 15) + `<span>Day ${store.state.streak} streak</span>`;
    buildMilestonesUI();
    if (moodOverride) character.update({ mood: moodOverride });
  }

  // ---------------------------------------------------------------
  // Tabs
  // ---------------------------------------------------------------
  const TABS = ['workout', 'progress', 'character', 'settings'];
  /** @param {string} name */
  function switchTab(name) {
    TABS.forEach(t => {
      $('tabBtn-' + t).setAttribute('aria-selected', String(t === name));
      $('panel' + t[0].toUpperCase() + t.slice(1)).classList.toggle('hidden', t !== name);
    });
    if (audio.unlocked) audio.play('tabSwitch');
    if (name === 'progress') renderProgressTab();
    if (name === 'character') renderCharacterTab();
  }
  TABS.forEach(t => $('tabBtn-' + t).addEventListener('click', () => switchTab(t)));

  // Another tab saved: pick up its data and redraw (the running workout session is untouched).
  window.addEventListener('storage', e => {
    if (e.key !== 'btb_state' && e.key !== 'btb_history' && e.key !== null) return;
    store.refresh();
    refreshCharacterUI();
    if (!session) { selectedGoal = store.state.goal; selectedIntensity = store.state.intensity; renderSetup(); }
    if (!$('panelProgress').classList.contains('hidden')) renderProgressTab();
    if (!$('panelCharacter').classList.contains('hidden')) renderCharacterTab();
  });

  // ---------------------------------------------------------------
  // Setup screen (goal + intensity pickers)
  // ---------------------------------------------------------------
  const GOAL_ICONS = { weight_loss: 'flame', endurance: 'heart', toning: 'bolt', quick_cardio: 'clock' };

  /** @param {HTMLElement} container @param {any[]} entries @param {string} selectedKey @param {Record<string,string>|null} iconMap @param {(key:string)=>void} onPick */
  function renderChoices(container, entries, selectedKey, iconMap, onPick) {
    container.innerHTML = '';
    entries.forEach(item => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'choice-card' + (item.key === selectedKey ? ' selected' : '');
      card.setAttribute('aria-pressed', String(item.key === selectedKey));
      const iconHtml = iconMap && iconMap[item.key] ? `<div class="choice-card-icon">${BTB.icon(iconMap[item.key], 16)}</div>` : '';
      card.innerHTML = `${iconHtml}<div class="choice-card-title">${item.label}</div><div class="choice-card-sub">${item.desc}</div>`;
      card.addEventListener('click', () => { if (audio.unlocked) audio.play('click'); onPick(item.key); });
      container.appendChild(card);
    });
  }

  function renderSetup() {
    renderChoices($('goalChoices'), Object.values(BTB.Goals), selectedGoal, GOAL_ICONS, key => {
      selectedGoal = key; store.state.goal = key; store.save(); renderSetup();
    });
    renderChoices($('intensityChoices'), Object.values(BTB.Intensities), selectedIntensity, null, key => {
      selectedIntensity = key; store.state.intensity = key; store.save(); renderSetup();
    });
    const preview = BTB.buildWorkout(selectedGoal, selectedIntensity, store.state.day);
    const totalReps = preview.exercises.reduce((/** @type {number} */ a, /** @type {any} */ e) => a + e.reps, 0);
    const kcal = preview.exercises.reduce((/** @type {number} */ a, /** @type {any} */ e) => a + BTB.estimateCalories(e, e.reps, store.state.weight), 0);
    const activeMin = preview.exercises.reduce((/** @type {number} */ a, /** @type {any} */ e) => a + e.secPerRep * e.reps, 0) / 60;
    const restMin = (preview.exercises.length - 1) * preview.intensity.restSec / 60;
    const totalMin = Math.max(1, Math.round(activeMin + restMin));
    $('setupSummary').innerHTML = `
      <div class="summary-pill">${BTB.icon('dumbbell', 14)}<strong>${preview.exercises.length}</strong>&nbsp;exercises</div>
      <div class="summary-pill">${BTB.icon('clock', 14)}~<strong>${totalMin}</strong>&nbsp;min</div>
      <div class="summary-pill">${BTB.icon('flame', 14)}~<strong>${Math.round(kcal)}</strong>&nbsp;kcal</div>
    `;
  }

  // ---------------------------------------------------------------
  // Workout session
  // ---------------------------------------------------------------
  function ensureTracker() {
    if (tracker) return tracker;
    tracker = new BTB.PoseTracker($('camVideo'), $('poseCanvas'), {
      onRep: handleRep,
      onPoseLost: () => { $('camStatusText').textContent = 'STEP BACK INTO FRAME'; $('camStatus').style.color = '#fbbf24'; },
      onPoseFound: () => { $('camStatusText').textContent = 'TRACKING'; $('camStatus').style.color = '#22c55e'; }
    });
    return tracker;
  }

  function buildQueueUI() {
    const list = $('queueList');
    list.innerHTML = '';
    session.exercises.forEach((/** @type {any} */ ex, /** @type {number} */ i) => {
      const cls = i < session.idx ? 'done' : i === session.idx ? 'active' : 'pending';
      const row = document.createElement('div');
      row.className = 'q-item ' + cls;
      row.innerHTML = `<div class="q-check">${i < session.idx ? BTB.icon('check', 12) : ''}</div>${ex.name}<span class="q-meta">${ex.reps} reps</span>`;
      list.appendChild(row);
    });
  }

  /** @param {any} ex */
  function loadExerciseUI(ex) {
    $('exName').textContent = ex.name;
    $('exTip').textContent = ex.tip;
    $('exTags').innerHTML = ex.tags.map((/** @type {string} */ t) => `<span class="tag">${t}</span>`).join('');
    $('repNum').textContent = '0';
    $('repOf').textContent = `/ ${ex.reps} reps`;
    $('repBar').style.width = '0%';
    clearInterval(demoAnimTimer);
    let ph = 0; ex.demo(ph);
    demoAnimTimer = setInterval(() => { ph = 1 - ph; ex.demo(ph); }, 900);
  }

  /** @param {number} seconds @param {string} startLabel @param {string} doneLabel @param {() => void} cb */
  function runCountdown(seconds, startLabel, doneLabel, cb) {
    const overlay = $('countdownOverlay'), num = $('countdownNum'), lbl = $('countdownLabel');
    overlay.classList.remove('hidden');
    lbl.textContent = startLabel;
    let n = seconds;
    num.textContent = String(n);
    if (n <= 3) { audio.play('countdownTick', n); voice.speak(String(n), { priority: 'high' }); }
    cancelCountdown();
    const iv = countdownIv = setInterval(() => {
      n--;
      if (n > 0) {
        num.textContent = String(n);
        if (n <= 3) { audio.play('countdownTick', n); voice.speak(String(n), { priority: 'high' }); }
      } else {
        clearInterval(iv);
        num.textContent = doneLabel;
        audio.play('countdownGo');
        voice.speak(doneLabel === 'GO!' ? "Go!" : doneLabel, { priority: 'high' });
        countdownTo = setTimeout(() => { countdownTo = null; overlay.classList.add('hidden'); if (session) cb(); }, 500);
      }
    }, 1000);
  }
  let countdownIv = null, countdownTo = null;
  function cancelCountdown() { clearInterval(countdownIv); clearTimeout(countdownTo); countdownIv = countdownTo = null; }

  /** @param {number} idx */
  function beginExercise(idx) {
    session.idx = idx;
    session.reps = 0;
    session.phase = 'countdown';
    const ex = session.exercises[idx];
    loadExerciseUI(ex);
    buildQueueUI();
    ensureTracker().setExercise(ex.key);
    character.update({ pose: 'idle', mood: 'normal' });
    runCountdown(3, 'GET READY', 'GO!', () => {
      session.phase = 'active';
      ensureTracker().setEnabled(true);
      if (!session.usingCamera && !session.camPending) startDemoFallback(ex);
      character.update({ pose: 'active', mood: 'working' });
      character.setFloat(false);
      setBubble('working');
    });
  }

  /** @param {any} ex */
  function startDemoFallback(ex) {
    stopDemoFallback();
    session.demoTimer = setInterval(() => {
      if (session && session.phase === 'active') handleRep();
    }, Math.max(650, ex.secPerRep * 900));
  }
  function stopDemoFallback() {
    if (session && session.demoTimer) { clearInterval(session.demoTimer); session.demoTimer = null; }
  }

  /** @param {number} [formScore] */
  function handleRep(formScore) {
    if (!session || session.phase !== 'active') return;
    const ex = session.exercises[session.idx];
    session.reps++;
    session.repsTotal = (session.repsTotal || 0) + 1;
    store.state.totalReps++;

    const kcal = BTB.estimateCalories(ex, 1, store.state.weight);
    const lbs = BTB.kcalToLbs(kcal) * BTB.BURN_GAME_SCALE;
    session.caloriesBurned = (session.caloriesBurned || 0) + kcal;
    store.state.weight = Math.max(store.state.goalWeight, store.state.weight - lbs);

    // Demo-mode reps (no camera) have no measured form — treat as a clean rep.
    const score = typeof formScore === 'number' ? formScore : 100;
    session.formScoreSum = (session.formScoreSum || 0) + score;
    session.formScoreCount = (session.formScoreCount || 0) + 1;

    $('repNum').textContent = session.reps;
    const flashColor = score >= 80 ? 'var(--color-accent)' : score >= 55 ? 'var(--color-warning)' : 'var(--color-destructive)';
    $('repNum').style.setProperty('--flash-color', flashColor);
    $('repNum').classList.remove('rep-flash'); void $('repNum').offsetWidth; $('repNum').classList.add('rep-flash');
    $('repBar').style.width = Math.min(100, (session.reps / ex.reps) * 100) + '%';

    refreshCharacterUI();
    checkMilestoneCrossing();
    checkAchievements();
    store.save();
    audio.play('rep');
    character.bounce();
    character.showSweat(true);
    setTimeout(() => character.showSweat(false), 550);
    setBubble('working');

    if (session.reps >= ex.reps) {
      completeExercise();
    } else if (session.reps % 5 === 0) {
      voice.speak(String(session.reps));
    }
  }

  function completeExercise() {
    session.phase = 'between';
    stopDemoFallback();
    clearInterval(demoAnimTimer);
    audio.play('setComplete');
    setBubble('setDone', true);
    buildQueueUI();
    session.exercises[session.idx].completed = true;
    store.markExerciseTried(session.exercises[session.idx].key);
    checkAchievements();
    store.save();

    if (session.idx + 1 >= session.exercises.length) {
      finishWorkoutSession();
    } else {
      startRest();
    }
  }

  function startRest() {
    session.phase = 'rest';
    ensureTracker().setEnabled(false);
    runCountdown(session.intensity.restSec, 'REST', 'GO!', () => {
      beginExercise(session.idx + 1);
    });
  }

  function finishWorkoutSession() {
    session.phase = 'done';
    ensureTracker().setEnabled(false);
    stopDemoFallback();
    clearInterval(demoAnimTimer);
    audio.stopMusic();
    audio.play('workoutComplete');
    store.state.totalWorkouts++;
    store.state.totalCaloriesBurned += (session.caloriesBurned || 0);
    checkAchievements();
    store.save();
    character.update({ pose: 'celebrate', mood: 'happy' });
    character.setFloat(true);
    character.showSparkle(true);
    character.wiggle();
    launchConfetti();
    setBubble('workoutDone', true);
    setTimeout(showEndOfDayModal, 1500);
  }

  // ---------------------------------------------------------------
  // Begin workout (entry point)
  // ---------------------------------------------------------------
  $('beginWorkoutBtn').addEventListener('click', () => {
    audio.unlock();
    session = Object.assign(BTB.buildWorkout(selectedGoal, selectedIntensity, store.state.day), {
      idx: 0, reps: 0, phase: 'idle', caloriesBurned: 0, repsTotal: 0, usingCamera: false, camPending: true
    });
    $('setupCard').classList.add('hidden');
    $('sessionCard').classList.remove('hidden');
    buildQueueUI();
    $('sessionCard').scrollIntoView({ block: 'start' });
    audio.startMusic(selectedIntensity);

    const t = ensureTracker();
    $('camStatusText').textContent = 'STARTING…';
    let camSettled = false;
    const fallbackToDemo = () => {
      if (camSettled) return;
      camSettled = true;
      session.usingCamera = false;
      session.camPending = false;
      $('camStatusText').textContent = 'NO CAMERA — DEMO MODE';
      $('camStatus').style.color = '#fbbf24';
      toast('No camera detected — running demo mode');
      if (session.phase === 'active') startDemoFallback(session.exercises[session.idx]);
    };
    t.start().then(() => {
      // a late grant (after demo mode began) still switches to the real camera
      camSettled = true;
      session.usingCamera = true;
      session.camPending = false;
      stopDemoFallback();
      $('camStatusText').textContent = 'LOADING MODEL…';
    }).catch(fallbackToDemo);
    setTimeout(fallbackToDemo, 4500); // permission prompt ignored/blocked — don't stall the game

    beginExercise(0);
  });

  // ---------------------------------------------------------------
  // End-of-day food modal
  // ---------------------------------------------------------------
  function showEndOfDayModal() {
    let eaten = [], totalCal = 0, plateArr = [];
    const lost = Math.max(0, store.state.startWeight - store.state.weight).toFixed(1);
    const avgFormScore = session.formScoreCount ? Math.round(session.formScoreSum / session.formScoreCount) : null;
    const box = $('modalBox');
    box.innerHTML = `
      <h2>Workout Complete!</h2>
      <div class="sub">${store.state.name} is down to <strong>${Math.round(store.state.weight)} lbs</strong> — ${lost} lbs lost on this journey so far.<br>Now it's dinner. Your choices here matter just as much as the workout.</div>
      ${avgFormScore !== null ? `<div class="result-pills"><div class="pill ${avgFormScore >= 80 ? 'pill-good' : avgFormScore >= 55 ? 'pill-info' : 'pill-bad'}">Avg form score: ${avgFormScore}</div></div>` : ''}
      <button class="btn btn-ghost btn-block btn-sm" id="shareBtn" style="margin-bottom:var(--sp-4)">${BTB.icon('share', 16)}<span>Share Result</span></button>
      <div class="food-game">
        <div class="food-game-title">Dinner Time</div>
        <div class="food-game-sub">Pick 2–5 items. Tap to add to the plate.</div>
        <div class="plate-wrap"><div class="plate" id="plate"></div></div>
        <div class="cal-row">
          <span style="font-size:11px;color:var(--color-fg-faint)">0</span>
          <div class="cal-bar-wrap"><div class="cal-bar" id="calBar" style="width:0%"></div></div>
          <span style="font-size:11px;color:var(--color-fg-faint)">${BTB.CAL_LIMIT} cal</span>
        </div>
        <div class="cal-labels"><span id="calLbl">0 calories</span><span>Suggested limit: ${BTB.CAL_LIMIT} cal</span></div>
        <div class="food-belt" id="belt"></div>
      </div>
      <div class="result-pills hidden" id="resultPills"></div>
      <button class="btn btn-primary btn-block" id="sleepBtn" disabled>${BTB.icon('check', 16)}<span>Sleep &amp; Start Tomorrow</span></button>
    `;
    const belt = $('belt');
    BTB.Foods.forEach((/** @type {any} */ f) => {
      const b = document.createElement('button');
      b.className = `food-btn ${f.healthy ? 'healthy' : 'unhealthy'}`;
      b.textContent = f.e;
      b.title = `${f.n} — ${f.cal} cal`;
      b.addEventListener('click', () => {
        if (b.classList.contains('eaten') || eaten.length >= 5) return;
        b.classList.add('eaten');
        eaten.push(f); totalCal += f.cal; plateArr.push(f.e);
        $('plate').textContent = plateArr.join('');
        const pct = Math.min(100, totalCal / BTB.CAL_LIMIT * 100);
        const bar = $('calBar');
        bar.style.width = pct + '%';
        bar.classList.toggle('cal-over', totalCal > BTB.CAL_LIMIT);
        $('calLbl').textContent = `${totalCal} calories`;

        const gainLbs = BTB.kcalToLbs(f.cal);
        store.state.weight = Math.min(store.state.startWeight + 15, store.state.weight + gainLbs);
        session.caloriesEaten = (session.caloriesEaten || 0) + f.cal;
        store.save();
        refreshCharacterUI();
        audio.play(f.healthy ? 'eatHealthy' : 'eatUnhealthy');
        character.wiggle();
        setBubble(f.healthy ? 'eatGood' : 'eatBad');

        if (eaten.length >= 2) {
          $('sleepBtn').disabled = false;
          const hc = eaten.filter(x => x.healthy).length, uc = eaten.filter(x => !x.healthy).length;
          const pills = $('resultPills');
          pills.classList.remove('hidden');
          pills.innerHTML = (hc ? `<div class="pill pill-good">${hc} healthy</div>` : '') +
            (uc ? `<div class="pill pill-bad">${uc} indulgent</div>` : '') +
            `<div class="pill pill-info">+${(totalCal / 3500).toFixed(2)} lbs from tonight</div>`;
          const sleepBtn = $('sleepBtn');
          sleepBtn.className = 'btn btn-block ' + (hc >= uc ? 'btn-accent' : 'btn-primary');
        }
      });
      belt.appendChild(b);
    });
    $('sleepBtn').addEventListener('click', finishDay);
    $('shareBtn').addEventListener('click', shareWorkoutResult);
    $('modalOverlay').classList.remove('hidden');
  }

  function shareWorkoutResult() {
    const canvas = document.createElement('canvas');
    BTB.renderShareCard(canvas, { session, store, t: fitnessT() });
    canvas.toBlob(async blob => {
      if (!blob) return;
      const file = new File([blob], 'beat-the-bulk-result.png', { type: 'image/png' });
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: 'Beat the Bulk', text: 'My workout result' }); return; }
        catch (e) { /* user cancelled or share failed — fall through to download */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'beat-the-bulk-result.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  }

  function finishDay() {
    const todayStr = new Date().toDateString();
    const yesterdayStr = new Date(Date.now() - 86400000).toDateString();
    if (store.state.lastPlayDate !== todayStr) {
      if (store.state.lastPlayDate === yesterdayStr) store.state.streak++;
      else store.state.streak = 1;
      store.state.bestStreak = Math.max(store.state.bestStreak, store.state.streak);
      store.state.lastPlayDate = todayStr;
    }
    store.state.day++;
    store.recordDay({
      day: store.state.day - 1,
      date: todayStr,
      weight: Math.round(store.state.weight * 10) / 10,
      caloriesBurned: Math.round(session.caloriesBurned || 0),
      caloriesEaten: Math.round(session.caloriesEaten || 0),
      repsTotal: session.repsTotal || 0,
      exercisesCompleted: session.exercises.length,
      avgFormScore: session.formScoreCount ? Math.round(session.formScoreSum / session.formScoreCount) : null
    });
    store.save();

    $('modalOverlay').classList.add('hidden');
    session = null;
    character.setFloat(false);
    character.showSparkle(false);
    character.update({ pose: 'idle', mood: fitnessT() > 0.6 ? 'happy' : 'normal' });
    $('sessionCard').classList.add('hidden');
    $('setupCard').classList.remove('hidden');
    renderSetup();
    refreshCharacterUI();
    setBubble(fitnessT() > 0.6 ? 'fit' : 'start');
    toast(`Day complete — streak now ${store.state.streak}!`);
  }

  // ---------------------------------------------------------------
  // Progress tab
  // ---------------------------------------------------------------
  function renderProgressTab() {
    BTB.drawWeightChart($('weightChart'), store);
    BTB.drawWeeklyChart($('weeklyChart'), store);
    const s = BTB.computeStats(store);
    $('statsGrid').innerHTML = `
      <div class="stat-box"><div class="stat-val">${s.lost.toFixed(1)}</div><div class="stat-lbl">lbs lost</div></div>
      <div class="stat-box"><div class="stat-val">${s.toGo.toFixed(1)}</div><div class="stat-lbl">lbs to go</div></div>
      <div class="stat-box"><div class="stat-val">${s.totalWorkouts}</div><div class="stat-lbl">workouts</div></div>
      <div class="stat-box"><div class="stat-val">${s.totalReps}</div><div class="stat-lbl">total reps</div></div>
      <div class="stat-box"><div class="stat-val">${s.streak}</div><div class="stat-lbl">day streak</div></div>
      <div class="stat-box"><div class="stat-val">${s.caloriesBurned}</div><div class="stat-lbl">kcal burned</div></div>
    `;
    const list = $('historyList');
    if (!store.history.length) {
      list.innerHTML = `<div class="empty-state">${BTB.icon('calendar', 40)}<div>No workouts logged yet — finish one to see it here.</div></div>`;
      return;
    }
    list.innerHTML = '';
    store.history.slice().reverse().slice(0, 20).forEach((/** @type {any} */ h) => {
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <div class="history-day">Day ${h.day}</div>
        <div class="history-detail">${h.exercisesCompleted} exercises · ${h.repsTotal} reps · ${h.caloriesBurned} kcal burned</div>
        <div class="history-weight">${h.weight} lbs</div>
      `;
      list.appendChild(row);
    });
  }

  // ---------------------------------------------------------------
  // Character tab
  // ---------------------------------------------------------------
  function renderCharacterTab() {
    $('charAboutTitle').innerHTML = BTB.icon('user', 18) + `<span>About ${store.state.name}</span>`;
    $('nameInput').value = store.state.name;
    const t = fitnessT();
    $('charStatsGrid').innerHTML = `
      <div class="stat-box"><div class="stat-val">${Math.round(store.state.weight)}</div><div class="stat-lbl">current lbs</div></div>
      <div class="stat-box"><div class="stat-val">${store.state.goalWeight}</div><div class="stat-lbl">goal lbs</div></div>
      <div class="stat-box"><div class="stat-val">${Math.round(t * 100)}%</div><div class="stat-lbl">fitness journey</div></div>
    `;
    const timeline = $('milestoneTimeline');
    timeline.innerHTML = '';
    milestoneThresholds().forEach((m, i) => {
      const reached = store.state.weight <= m + 0.05;
      const row = document.createElement('div');
      row.className = 'history-row';
      row.innerHTML = `
        <div class="q-check" style="border-color:${reached ? 'var(--color-accent)' : 'var(--color-border-strong)'};color:${reached ? 'var(--color-accent)' : 'var(--color-fg-faint)'}">${reached ? BTB.icon('check', 12) : ''}</div>
        <div class="history-detail" style="font-weight:700;color:${reached ? 'var(--color-fg)' : 'var(--color-fg-faint)'}">Reach ${Math.round(m)} lbs</div>
        <div class="history-weight" style="color:${reached ? 'var(--color-accent)' : 'var(--color-fg-faint)'}">${reached ? 'Done' : 'Locked'}</div>
      `;
      timeline.appendChild(row);
    });
    renderAchievements();
  }

  function renderAchievements() {
    const list = $('achievementsList');
    list.innerHTML = '';
    const unlocked = store.state.unlockedAchievements || [];
    BTB.Achievements.forEach((/** @type {any} */ a) => {
      const done = unlocked.includes(a.id);
      const row = document.createElement('div');
      row.className = 'history-row';
      row.style.marginBottom = 'var(--sp-2)';
      row.innerHTML = `
        <div class="q-check" style="border-color:${done ? 'var(--color-accent)' : 'var(--color-border-strong)'};color:${done ? 'var(--color-accent)' : 'var(--color-fg-faint)'}">${done ? BTB.icon('check', 12) : BTB.icon(a.iconKey, 12)}</div>
        <div class="history-detail" style="font-weight:700;color:${done ? 'var(--color-fg)' : 'var(--color-fg-faint)'}">${a.name}<div style="font-weight:500;font-size:11px;margin-top:2px">${a.desc}</div></div>
        <div class="history-weight" style="color:${done ? 'var(--color-accent)' : 'var(--color-fg-faint)'}">${done ? 'Done' : 'Locked'}</div>
      `;
      list.appendChild(row);
    });
  }

  $('nameInput').addEventListener('input', (/** @type {{target: any}} */ e) => {
    const v = e.target.value.trim() || 'Buddy';
    store.state.name = v;
    store.save();
    $('charNameDisplay').textContent = v;
    $('charAboutTitle').innerHTML = BTB.icon('user', 18) + `<span>About ${v}</span>`;
  });

  // ---------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------
  function initSettings() {
    $('musicVolSlider').value = audio.musicVol;
    $('sfxVolSlider').value = audio.sfxVol;
    $('muteToggle').checked = audio.muted;
    $('goalWeightInput').value = store.state.goalWeight;
    $('currentWeightInput').value = store.state.weight;
    $('voiceToggle').checked = voice.enabled;
    $('voiceRateSlider').value = voice.rate;

    $('voiceToggle').addEventListener('change', (/** @type {{target: any}} */ e) => {
      voice.setEnabled(e.target.checked);
      if (e.target.checked) voice.speak('Voice coaching on.', { priority: 'high' });
    });
    $('voiceRateSlider').addEventListener('input', (/** @type {{target: any}} */ e) => { voice.setRate(parseFloat(e.target.value)); });

    $('musicVolSlider').addEventListener('input', (/** @type {{target: any}} */ e) => { audio.unlock(); audio.setMusicVolume(parseFloat(e.target.value)); });
    $('sfxVolSlider').addEventListener('input', (/** @type {{target: any}} */ e) => { audio.unlock(); audio.setSfxVolume(parseFloat(e.target.value)); audio.play('click'); });
    $('muteToggle').addEventListener('change', (/** @type {{target: any}} */ e) => {
      audio.unlock();
      audio.setMuted(e.target.checked);
      syncMuteButton();
    });
    $('muteBtn').addEventListener('click', () => {
      audio.unlock();
      audio.setMuted(!audio.muted);
      $('muteToggle').checked = audio.muted;
      syncMuteButton();
    });

    $('goalWeightInput').addEventListener('change', (/** @type {{target: any}} */ e) => {
      let v = parseFloat(e.target.value);
      if (isNaN(v)) v = store.state.goalWeight; // empty input keeps the previous value
      v = Math.min(400, Math.max(90, v));
      if (v > store.state.weight - 5) v = Math.max(90, store.state.weight - 5);
      store.state.goalWeight = v;
      e.target.value = String(v);
      store.save();
      refreshCharacterUI();
      toast('Goal weight updated');
    });
    $('currentWeightInput').addEventListener('change', (/** @type {{target: any}} */ e) => {
      let v = parseFloat(e.target.value);
      if (isNaN(v)) v = store.state.weight; // empty input keeps the previous value
      v = Math.min(500, Math.max(90, v));
      store.state.weight = v;
      if (v > store.state.startWeight) store.state.startWeight = v;
      e.target.value = String(v);
      store.save();
      refreshCharacterUI();
      toast('Current weight updated');
    });

    $('resetBtn').addEventListener('click', () => {
      if (!resetArmed) {
        resetArmed = true;
        label('resetBtn', 'x', 'Tap again to confirm reset');
        $('resetBtn').style.borderColor = 'rgba(239,68,68,0.6)';
        $('resetBtn').style.color = '#f87171';
        setTimeout(() => {
          if (resetArmed) { resetArmed = false; label('resetBtn', 'x', 'Reset All Progress'); $('resetBtn').style.borderColor = ''; $('resetBtn').style.color = ''; }
        }, 4000);
        return;
      }
      resetArmed = false;
      store.reset();
      selectedGoal = store.state.goal;
      selectedIntensity = store.state.intensity;
      stopDemoFallback();
      clearInterval(demoAnimTimer);
      cancelCountdown();
      audio.stopMusic();
      session = null;
      $('countdownOverlay').classList.add('hidden');
      $('modalOverlay').classList.add('hidden');
      $('sessionCard').classList.add('hidden');
      $('setupCard').classList.remove('hidden');
      label('resetBtn', 'x', 'Reset All Progress');
      $('resetBtn').style.borderColor = '';
      $('resetBtn').style.color = '';
      character.update({ t: 0, pose: 'idle', mood: 'sad' });
      refreshCharacterUI();
      renderSetup();
      toast('Progress reset');
    });
  }

  function syncMuteButton() {
    const btn = $('muteBtn');
    btn.innerHTML = BTB.icon(audio.muted ? 'volumeMute' : 'volume', 18);
    btn.classList.toggle('is-on', !audio.muted);
    btn.setAttribute('aria-pressed', String(audio.muted));
  }

  // ---------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------
  function init() {
    initStaticLabels();
    character = new BTB.Character($('charStage'));
    BTB.startBlinkLoop(character);
    initSettings();
    syncMuteButton();
    renderSetup();
    refreshCharacterUI();
    setBubble(fitnessT() > 0.6 ? 'fit' : 'lazy');
    switchTab('workout');

    // Unlock audio on first interaction anywhere, per browser autoplay policy
    const unlockOnce = () => { audio.unlock(); document.removeEventListener('pointerdown', unlockOnce); };
    document.addEventListener('pointerdown', unlockOnce, { once: true });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
