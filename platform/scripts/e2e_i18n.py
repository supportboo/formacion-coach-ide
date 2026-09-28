"""Playwright (mocked /api/*) for SkillUp 1.5.0 i18n. Serves platform/public from disk under a fake origin.
Run from anywhere: E2E_OUT=<dir> python platform/scripts/e2e_i18n.py
-> PASS/FAIL per check + small JPEG screenshots in E2E_OUT (default: current directory)."""
import json, re, os, sys, mimetypes
from urllib.parse import urlparse, parse_qs
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
OUT = os.environ.get('E2E_OUT') or os.getcwd()
ORIGIN = 'http://skillup.test'
RESULTS = []

def check(name, cond):
    RESULTS.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

def vids(lang):
    titles = {'es': 'Cómo prospectar clientes B2B', 'en': 'How to prospect B2B clients', 'fr': 'Comment prospecter des clients B2B',
              'ca': 'Com prospectar clients B2B', 'pt': 'Como prospetar clientes B2B'}
    t = titles.get(lang, titles['es'])
    return [{'youtubeId': 'vid%s%d' % (lang, i), 'title': '%s (%d)' % (t, i), 'channel': 'Canal %d' % i, 'thumbnail': '',
             'views': 120000 - i * 9000, 'likes': 5400 - i * 300, 'comments': 300, 'quality': 90 - i, 'publishedAt': '2026-05-01T00:00:00Z',
             'durationSeconds': 640, 'subscribers': 80000, 'lang': lang} for i in range(4)]

def make_handler(state):
    course = open(os.path.join(ROOT, '..', 'outbound-sales.html'), encoding='utf-8').read()
    def handler(route):
        req = route.request; u = urlparse(req.url)
        if u.hostname != 'skillup.test':
            return route.abort()
        p = u.path; q = parse_qs(u.query)
        def js(obj, status=200):
            return route.fulfill(status=status, content_type='application/json', body=json.dumps(obj))
        if p.startswith('/api/'):
            state['calls'].append((req.method, p + ('?' + u.query if u.query else '')))
            if p == '/api/auth/get-session':
                return js({'session': {'id': 's'}, 'user': {'id': 'u1', 'name': 'Ana Test', 'email': 'ana@test.es'}})
            if p == '/api/org/me/lang' and req.method == 'PUT':
                body = json.loads(req.post_data or '{}'); state['lang'] = body.get('lang'); state['chosen'] = True
                return js({'lang': state['lang']})
            if p == '/api/org/me':
                return js({'role': 'empleado', 'platformAdmin': False, 'approved': True, 'capabilities': {}, 'lang': state['lang'], 'langChosen': state['chosen'], 'langs': ['es', 'en', 'ca', 'pt', 'fr']})
            if p == '/api/learning/videos' or p == '/api/learning/videos/home':
                lang = (q.get('lang') or [state['lang']])[0]
                v = vids(lang)
                return js({'novedades': v, 'masVistos': v, 'masValorados': v, 'paraTi': [], 'brandooersFavs': [], 'lang': lang})
            if p == '/api/learning/course-src':
                return route.fulfill(status=200, content_type='text/html; charset=utf-8', body=course)
            if p == '/api/learning/translate':
                body = json.loads(req.post_data or '{}')
                html = re.sub(r'>([^<>]+)<', lambda m: '>' + ('[EN] ' + m.group(1) if m.group(1).strip() else m.group(1)) + '<', body.get('html', ''))
                return js({'html': html, 'cached': False})
            if p == '/api/notes/list':
                return js({'items': []})
            if p == '/api/voice/voices':
                return js({'provider': 'none', 'voices': []})
            if p == '/api/agent/terms':
                return js({'terms': []})
            if p == '/api/agent/feedback/notices':
                return js({'notices': []})
            if p == '/api/catalog/sectors':
                return js([])
            return js({})
        f = os.path.join(PUB, p.lstrip('/').replace('/', os.sep))
        if os.path.isfile(f):
            ct = mimetypes.guess_type(f)[0] or 'application/octet-stream'
            if f.endswith('.js'): ct = 'application/javascript'
            return route.fulfill(status=200, content_type=ct, body=open(f, 'rb').read())
        return route.fulfill(status=404, body='nf')
    return handler

def shot(page, name):
    page.screenshot(path=os.path.join(OUT, name), type='jpeg', quality=55)

def new_page(b, w, h, locale, state):
    ctx = b.new_context(viewport={'width': w, 'height': h}, locale=locale, device_scale_factor=1)
    ctx.add_init_script("try{localStorage.setItem('skillup-welcome-video-seen','1');}catch(e){}")
    page = ctx.new_page(); page.route('**/*', make_handler(state))
    errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
    return ctx, page, errs

with sync_playwright() as pw:
    b = pw.chromium.launch()
    # 1) Onboarding: first step = language, default from the browser (en-GB), then the rest in English.
    for w, h in ((390, 780), (1280, 800)):
        st = {'lang': 'es', 'chosen': False, 'calls': []}
        ctx, page, errs = new_page(b, w, h, 'en-GB', st)
        page.goto(ORIGIN + '/app/bienvenida.html'); page.wait_for_selector('#chips button')
        first = page.locator('#conv .b.a').first.inner_text()
        check('onb %d: language question in browser language (English)' % w, 'which language' in first)
        check('onb %d: browser language preselected first' % w, page.locator('#chips button').first.get_attribute('data-lang') == 'en' and 'def' in (page.locator('#chips button').first.get_attribute('class') or ''))
        check('onb %d: 5 languages offered' % w, page.locator('#chips button').count() == 5)
        if w == 390: page.wait_for_timeout(500); shot(page, 'onb-lang-390.jpg')
        page.locator('#chips button[data-lang=en]').click()
        page.wait_for_function("document.querySelectorAll('#conv .b.a').length>=2")
        check('onb %d: PUT /api/org/me/lang saved en' % w, st['lang'] == 'en' and any(c[0] == 'PUT' for c in st['calls']))
        check('onb %d: <html lang="en">' % w, page.evaluate('document.documentElement.lang') == 'en')
        second = page.locator('#conv .b.a').nth(1).inner_text()
        check('onb %d: next question in English' % w, second.startswith('Hi. Let'))
        check('onb %d: input placeholder in English' % w, page.get_attribute('#inp', 'placeholder') == 'Type or dictate your answer…')
        if w == 390: page.wait_for_timeout(500); shot(page, 'onb-after-en-390.jpg')
        check('onb %d: no JS errors' % w, not errs)
        ctx.close()

    # 2) Switching to English from the menu changes nav + eyes chrome + html lang (live, no reload).
    for w, h in ((390, 780), (1280, 800)):
        st = {'lang': 'es', 'chosen': True, 'calls': []}
        ctx, page, errs = new_page(b, w, h, 'es-ES', st)
        page.goto(ORIGIN + '/app/videos.html'); page.wait_for_selector('.sunav-fab'); page.wait_for_selector('.boo-fab')
        check('switch %d: starts in Spanish' % w, page.evaluate('document.documentElement.lang') == 'es' and page.get_attribute('.boo-panel input', 'placeholder') == 'Escribe o habla…')
        page.click('.sunav-fab'); page.wait_for_timeout(300)
        page.select_option('#sunav-lsel', 'en'); page.wait_for_function("document.documentElement.lang==='en'")
        labels = page.locator('.sunav-panel .sunav-item span[data-i18n]').all_inner_texts()
        check('switch %d: nav in English' % w, 'Videos' in labels and 'Your data' in labels and 'Log out' in labels and 'Language' in labels)
        check('switch %d: saved to account' % w, st['lang'] == 'en')
        if w == 390: shot(page, 'nav-en-390.jpg')
        page.keyboard.press('Escape'); page.wait_for_timeout(250)
        check('switch %d: eyes chrome in English' % w, page.get_attribute('.boo-panel input', 'placeholder') == 'Type or speak…'
              and page.get_attribute('.boo-fab', 'aria-label') == 'Open the Brandooers assistant' and page.inner_text('.boo-head b') == 'Assistant')
        check('switch %d: videos follow the platform language' % w, any('lang=en' in c[1] for c in st['calls'] if 'videos' in c[1]) and 'Only videos in English' in page.inner_text('#vnote'))
        page.locator('.boo-fab').click(); page.wait_for_timeout(400)
        if w == 1280: shot(page, 'eyes-en-1280.jpg')
        check('switch %d: no JS errors' % w, not errs)
        ctx.close()

    # 3) Video language filter: videos page selector and in-course panel.
    for w, h in ((390, 780), (1280, 800)):
        st = {'lang': 'es', 'chosen': True, 'calls': []}
        ctx, page, errs = new_page(b, w, h, 'es-ES', st)
        page.goto(ORIGIN + '/app/videos.html'); page.wait_for_selector('.card')
        check('videos %d: default = user language (es)' % w, page.input_value('#vlang') == 'es' and 'Solo vídeos en español' in page.inner_text('#vnote'))
        page.select_option('#vlang', 'fr'); page.wait_for_function("document.querySelector('.card .t') && /Comment/.test(document.querySelector('.card .t').textContent)")
        check('videos %d: selector asks lang=fr and shows French videos' % w, any('lang=fr' in c[1] for c in st['calls']) and 'Uniquement des vidéos en français' in page.inner_text('#vnote'))
        check('videos %d: platform language untouched' % w, st['lang'] == 'es')
        check('videos %d: views/likes shown as measured' % w, '120K' in page.inner_text('.card .s'))
        if w == 390: shot(page, 'videos-fr-390.jpg')
        page.goto(ORIGIN + '/app/curso.html?src=%2Foutbound-sales.html'); page.wait_for_selector('#vidBtn')
        page.click('#vidBtn'); page.wait_for_selector('#cvList .cv-item')
        check('course %d: panel default es' % w, page.input_value('#cvLang') == 'es' and any('/api/learning/videos?topic=' in c[1] and 'lang=es' in c[1] for c in st['calls']))
        page.select_option('#cvLang', 'en'); page.wait_for_function("/How to/.test((document.querySelector('#cvList .cv-item b')||{}).textContent||'')")
        check('course %d: panel filter lang=en' % w, any('/api/learning/videos?topic=' in c[1] and 'lang=en' in c[1] for c in st['calls'])
              and 'Only videos in English' in page.inner_text('#cvNote') and page.get_attribute('#cvAll', 'href').endswith('lang=en'))
        if w == 1280: page.wait_for_timeout(1500); shot(page, 'course-videos-en-1280.jpg')
        check('course %d: no JS errors' % w, not errs)
        ctx.close()

    # 4) Course section auto-translation with "ver original" toggle (user language = en).
    st = {'lang': 'en', 'chosen': True, 'calls': []}
    ctx, page, errs = new_page(b, 390, 780, 'en-GB', st)
    page.goto(ORIGIN + '/app/curso.html?src=%2Foutbound-sales.html'); page.wait_for_selector('.txbar button')
    tx = [c for c in st['calls'] if c[1].startswith('/api/learning/translate')]
    check('translate: current + next section requested', len(tx) >= 2)
    first_card = page.locator('#track .card').first
    check('translate: section shows translated text', '[EN]' in first_card.locator('.prose').inner_text())
    check('translate: bar says automatically translated', 'Automatically translated' in first_card.locator('.txbar').inner_text())
    page.wait_for_timeout(1800); shot(page, 'course-translated-390.jpg')
    first_card.locator('.txbar button').click()
    check('translate: see original restores Spanish', '[EN]' not in first_card.locator('.prose').inner_text() and 'Original in Spanish' in first_card.locator('.txbar').inner_text())
    check('translate: no JS errors', not errs)
    ctx.close()
    b.close()

bad = [n for n, ok in RESULTS if not ok]
print('\n%d/%d checks passed' % (len(RESULTS) - len(bad), len(RESULTS)))
sys.exit(1 if bad else 0)
