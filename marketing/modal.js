/* Download confirmation: the Gatekeeper explanation nobody should miss.
   Vanilla JS like the rest of the page; no dependencies. Focus moves into
   the dialog on open, is trapped while it is open, and returns to the
   download button on close. Escape, the close control, and a click on the
   scrim all dismiss it. */

(function () {
  'use strict';

  var overlay = document.getElementById('download-modal');
  var trigger = document.getElementById('download-cta');
  if (!overlay || !trigger) return;

  var panel = overlay.querySelector('.modal-panel');
  var closeButton = document.getElementById('download-modal-close');
  var copyButton = document.getElementById('download-modal-copy');
  var command = document.getElementById('download-modal-cmd');
  var continueLink = document.getElementById('download-modal-continue');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var lastFocus = null;
  var copyTimer = null;

  function t(key, fallback) {
    var value = window.evaI18n ? window.evaI18n.t(key) : key;
    return value === key ? fallback : value;
  }

  function isOpen() {
    return !overlay.hidden;
  }

  function open() {
    // The download button is the dialog's only opener; return focus there
    // explicitly, since Safari does not focus links on mouse click.
    lastFocus = trigger;
    overlay.hidden = false;
    if (reducedMotion.matches) {
      overlay.classList.add('open');
    } else {
      // Two frames so the transition starts from the just-unhidden state.
      window.requestAnimationFrame(function () {
        window.requestAnimationFrame(function () {
          overlay.classList.add('open');
        });
      });
    }
    panel.focus();
  }

  function close() {
    overlay.classList.remove('open');
    var finish = function () {
      overlay.hidden = true;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    };
    if (reducedMotion.matches) finish();
    else window.setTimeout(finish, 190);
  }

  trigger.addEventListener('click', function (event) {
    event.preventDefault();
    open();
  });

  closeButton.addEventListener('click', close);

  overlay.addEventListener('mousedown', function (event) {
    if (event.target === overlay) close();
  });

  // The link itself performs the download; the dialog's job is done.
  continueLink.addEventListener('click', function () {
    close();
  });

  document.addEventListener('keydown', function (event) {
    if (!isOpen()) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    var focusables = panel.querySelectorAll('button, a[href]');
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (event.shiftKey) {
      // The panel itself holds initial focus; Shift+Tab wraps to the end.
      if (document.activeElement === first || document.activeElement === panel) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });

  function markCopied() {
    copyButton.textContent = t('modal.copied', 'Copied');
    window.clearTimeout(copyTimer);
    copyTimer = window.setTimeout(function () {
      copyButton.textContent = t('modal.copy', 'Copy');
    }, 1600);
  }

  function fallbackCopy(text) {
    var range = document.createRange();
    range.selectNodeContents(command);
    var selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    try {
      if (document.execCommand('copy')) markCopied();
    } catch (error) {
      // The command stays selected; copying by hand still works.
    }
    selection.removeAllRanges();
    void text;
  }

  copyButton.addEventListener('click', function () {
    var text = command.textContent;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(markCopied, function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  });

  // Deep link: #download opens the dialog directly, so release notes and
  // docs can point straight at the instructions.
  if (window.location.hash === '#download') open();
})();
