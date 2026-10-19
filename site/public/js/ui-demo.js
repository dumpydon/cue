// Deliberate, synthetic examples; this page never calls a model or records.
export function setupProductExamples() {
  const one = selector => document.querySelector(selector);
  const all = selector => [...document.querySelectorAll(selector)];
  const demo = one('#product-demo');
  if (demo) {
    const examples = {
      conversation: { mode: 'General', question: 'What should I say?', answer: '<p><strong>I’d start by clarifying the outcome</strong> and asking which constraints matter most.</p><p>Then I’d break the work into a small first step, validate the riskiest assumption, and adjust based on what we learn.</p>', transcript: 'Them: How would you approach a project with unclear requirements?' },
      code: { mode: 'Coding', question: 'Find the maximum average of k consecutive values.', answer: "<p><strong>Use a fixed-size sliding window.</strong> Add the new value and remove the value leaving the window.</p><pre><code><span class=\"kw\">def</span> <span class=\"fn\">find_max_average</span>(nums, k):\n    window_sum = <span class=\"fn\">sum</span>(nums[:k])\n    best = window_sum\n    <span class=\"kw\">for</span> right <span class=\"kw\">in</span> <span class=\"fn\">range</span>(k, <span class=\"fn\">len</span>(nums)):\n        window_sum += nums[right] - nums[right-k]\n        best = <span class=\"fn\">max</span>(best, window_sum)\n    <span class=\"kw\">return</span> best / k</code></pre>", transcript: 'Time O(n) · Extra space O(1) · Python' },
      idea: { mode: 'Learning', question: 'Explain the idea in a simple way.', answer: '<p><strong>Think of a sliding window as a fixed-size frame</strong> moving across a list.</p><p>At each step, one value enters and one leaves. Update the running sum instead of adding every value again.</p>', transcript: 'An explanation grounded in the question in front of you.' }
    };
    const tabs = all('[data-scene]');
    function choose(tab) {
      const example = examples[tab.dataset.scene];
      if (!example) return;
      tabs.forEach(item => { const selected = item === tab; item.setAttribute('aria-selected', String(selected)); item.tabIndex = selected ? 0 : -1; });
      one('#demo-mode-label').textContent = example.mode;
      one('#demo-question').textContent = example.question;
      one('#demo-response').innerHTML = example.answer;
      one('#demo-transcript').textContent = example.transcript;
    }
    tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => choose(tab));
      tab.addEventListener('keydown', event => {
        let next;
        if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
        else if (event.key === 'ArrowLeft') next = (index + tabs.length - 1) % tabs.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabs.length - 1;
        else return;
        event.preventDefault(); choose(tabs[next]); tabs[next].focus();
      });
    });
    one('#demo-incognito').addEventListener('click', event => {
      const button = event.currentTarget, enabled = button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(enabled));
      button.querySelector('img').src = enabled ? '/assets/incognito.svg' : '/assets/eye.svg';
      demo.classList.toggle('demo-protected', enabled); demo.classList.toggle('demo-detectable', !enabled);
    });
  }
  const modes = {
    interview: { title: 'Interview', context: 'Use my background as the source of truth. Keep the reply focused and easy to say out loud. If details are missing, give me a structure I can fill in.', file: 'Resume.pdf' },
    design: { title: 'System design', context: 'Clarify the requirements, estimate the scale, then walk through a realistic architecture. Explain the tradeoffs and the biggest risks.', file: 'Project brief.pdf' },
    meeting: { title: 'Team meeting', context: 'Help me contribute clearly. Keep track of decisions, open questions, and next steps. Use our project notes as reference context.', file: 'Team notes.md' }
  };
  all('[data-mode]').forEach(button => button.addEventListener('click', () => {
    const mode = modes[button.dataset.mode];
    all('[data-mode]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    one('#context-mode-title').textContent = mode.title;
    one('#context-mode-text').textContent = mode.context;
    one('#context-file-name').textContent = mode.file;
  }));
  const slider = one('#visibility-slider');
  slider?.addEventListener('input', () => {
    one('#comparison').style.setProperty('--split', slider.value + '%');
    slider.setAttribute('aria-valuetext', slider.value + ' percent local view');
  });
}
