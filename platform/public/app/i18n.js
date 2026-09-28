/* SkillUp · idioma de la interfaz (1.5.0). Capa mínima sin dependencias.
   - Idioma = preferencia de la cuenta (/api/org/me -> lang). Se recuerda en este navegador para pintar al instante.
   - Texto fuente: castellano de España, escrito en cada página/módulo. Aquí solo van los otros idiomas.
   - Uso en JS:   SUI18n.t('clave', 'Texto en español', { x: 'valor' })   -> texto en el idioma activo
   - Uso en HTML: data-i18n="clave" (texto) y data-i18n-attr="placeholder:clave;title:clave;aria-label:clave".
     Se aplica solo al cargar, al añadir nodos (MutationObserver) y al cambiar de idioma.
   - Añadir idioma: entrada en LANGS + diccionario en D (+ servidor: services/lang.ts). */
(function () {
  'use strict';
  if (window.SUI18n) return;

  var LANGS = { es: 'Español', en: 'English', ca: 'Català', pt: 'Português', fr: 'Français' };
  var SPEECH = { es: 'es-ES', en: 'en-GB', ca: 'ca-ES', pt: 'pt-PT', fr: 'fr-FR' };
  // Nota del selector de vídeos, escrita en el idioma de los propios vídeos (se lee igual la entienda o no la interfaz).
  var NOTE = {
    es: 'Solo vídeos en español · muy bien valorados y con interacción real',
    en: 'Only videos in English · highly rated, with real engagement',
    ca: 'Només vídeos en català · ben valorats i amb interacció real',
    pt: 'Apenas vídeos em português · bem avaliados e com interação real',
    fr: 'Uniquement des vidéos en français · très bien notées, avec un vrai engagement'
  };

  var D = {
    en: {
      "cr.title": "Creation credits",
      "cr.credits": "{n} credits",
      "cr.perMin": " / min",
      "cr.soon": "Coming soon",
      "cr.locked": "Reach Coach level (N4) in any competency to unlock AI creation for your company. This is what you will be able to create:",
      "cr.balance": "Your company's balance. This is what you can create:",
      "cr.topic": "Course topic, e.g. \"Negotiating with suppliers\"",
      "cr.create": "Create course with AI",
      "cr.buy": "Buy credits",
      "cr.needTopic": "Write the course topic.",
      "cr.working": "The expert panel is writing and reviewing the course…",
      "cr.gate": "Creating this course costs {c} credits. Your company has {b} left.",
      "cr.confirm": "Confirm",
      "cr.spent": "{s} credits spent · {b} left.",
      "cr.draft": "See draft",
      "cr.item.voz_narrada": "Narrated voice",
      "cr.item.avatar_estandar": "Standard avatar video (HeyGen Avatar IV)",
      "cr.item.avatar_realista": "Realistic avatar video (HeyGen Avatar V)",
      "cr.item.avatar_propio": "Create your own avatar",
      "cr.item.clonar_voz": "Clone your voice",
      "cr.item.curso_ia": "Create a course with AI (expert panel)",

      'nav.dashboard': 'My dashboard', 'nav.courses': 'Courses', 'nav.explore': 'Explore', 'nav.videos': 'Videos', 'nav.roleplays': 'Role-plays',
      'nav.ranking': 'Leaderboard', 'nav.certs': 'Certificates', 'nav.teamdna': 'Team DNA', 'nav.help': 'Help', 'nav.privacy': 'Your data',
      'nav.assign': 'Assign tests', 'nav.validate': 'Validate cases', 'nav.metrics': 'Metrics and insights', 'nav.live': 'Live',
      'nav.company': 'Company dashboard', 'nav.chatuse': 'Chat usage', 'nav.pyramids': 'Pyramids', 'nav.roi': 'ROI report',
      'nav.feedback': 'Feedback', 'nav.console': 'Console', 'nav.suggest': 'Send a suggestion', 'nav.suggestB': 'Send a suggestion to Brandooers',
      'nav.exit': 'Log out', 'nav.open': 'Open menu', 'nav.close': 'Close', 'nav.nav': 'Navigation', 'nav.lang': 'Language',
      'nav.langSaved': 'Language saved', 'nav.langErr': 'Could not save the language',

      'eyes.fab': 'Open the Brandooers assistant', 'eyes.fabTitle': 'Tap to open the assistant · press and hold to talk to it directly',
      'eyes.title': 'Assistant', 'eyes.voice': 'Voice', 'eyes.read': 'Read replies aloud', 'eyes.home': 'Main menu', 'eyes.homeAria': 'Go to the main menu',
      'eyes.close': 'Close', 'eyes.dictate': 'Dictate', 'eyes.talk': 'Speak', 'eyes.placeholder': 'Type or speak…', 'eyes.msg': 'Message', 'eyes.send': 'Send',
      'eyes.tutors': 'Your tutors', 'eyes.tutorOf': '{x} tutor', 'eyes.openCourse': "Open {x}'s course",
      'eyes.spec.Comercial': 'Sales', 'eyes.spec.Marketing': 'Marketing', 'eyes.spec.Negociación': 'Negotiation', 'eyes.spec.Acompañamiento': 'Coaching',
      'eyes.micPerm': 'I need permission to use the microphone. Turn it on in your browser settings, or type to me here.',
      'eyes.micNone': "I can't find a microphone on this device. You can type to me here.",
      'eyes.micNA': "Voice dictation isn't available in this browser right now. Type to me and I'll answer.",
      'eyes.hello': 'Hi', 'eyes.fallback': "Hi{name}. I'm your Brandooers guide. Tell me your goal or ask me where to start.",
      'eyes.down': "I can't answer right now (the AI service is unavailable). Please try again in a moment.",
      'eyes.noVoice': "This browser doesn't let you talk to me by voice. Tap the eyes and type to me.",
      'eyes.listening': "I'm listening…", 'eyes.micPerm2': 'I need permission to use the microphone. Turn it on in your browser settings.',
      'eyes.notHeard': "I didn't hear you. Keep the eyes pressed while you speak.", 'eyes.cantAnswer': "I can't answer right now. Please try again in a moment.",
      'eyes.mute': "Mute the agents' voice", 'eyes.unmute': "Turn on the agents' voice", 'eyes.voiceOff': 'Mute the voice', 'eyes.voiceOn': 'Read to me aloud',
      'eyes.g.inicio': 'Here you can see your progress and your courses. Tap a card to pick up where you left off.',
      'eyes.g.ruta': 'This is your knowledge map. Hover over the bubbles and click to open a topic.',
      'eyes.g.explorar': "Ask me anything, or search for a course. I'll leave resources here next to the answer.",
      'eyes.g.workforce': 'Here you can see how the whole team learns, grouped by how each person contributes.',

      'dict.listening': "I'm listening · tap to finish", 'dict.convo': 'Conversation on · tap to finish', 'dict.talk': 'Speak',

      'fb.useful': 'Useful answer', 'fb.improvable': 'Could be better', 'fb.thanks': 'Thanks', 'fb.saveErr': "Couldn't save",
      'fb.what': 'What went wrong? It helps us improve.', 'fb.reason': 'Reason', 'fb.comment': 'Comment (optional)', 'fb.send': 'Send', 'fb.cancel': 'Cancel',
      'fb.r.dato_incorrecto': 'Wrong information', 'fb.r.fuera_de_tema': 'Off topic', 'fb.r.no_lo_entiendo': "I don't understand it",
      'fb.r.voz': 'The voice sounds wrong or fails', 'fb.r.palabra_mal_escrita': 'Misspelt word', 'fb.r.otro': 'Other',
      'fb.t.sugerencia': 'Suggestion', 'fb.t.error': 'Bug', 'fb.t.contenido': 'Content request', 'fb.t.otro': 'Other',
      'fb.s.nuevo': 'Received', 'fb.s.en_revision': 'Under review', 'fb.s.resuelto': 'Resolved', 'fb.s.descartado': 'Dismissed',
      'fb.titleAdmin': 'Send a suggestion to Brandooers', 'fb.title': 'Send a suggestion',
      'fb.subAdmin': "Tell us what you'd improve in the platform for your company. The Brandooers team reads it.",
      'fb.sub': "An idea, a bug or some content you're missing. We read everything.",
      'fb.type': 'Type', 'fb.yourMsg': 'Your message', 'fb.ph': 'Write here…',
      'fb.ctx': 'The page, your role, your company and your browser are attached automatically. Nothing else.',
      'fb.close': 'Close', 'fb.mine': "What you've already sent", 'fb.more': 'Write a little more', 'fb.sendErr': "Couldn't send",
      'fb.ok': "Thanks. We've received it and we'll let you know when it's resolved.", 'fb.rated': 'Rated answer',
      'fb.yourSug': 'Your suggestion', 'fb.yourRating': 'Your rating', 'fb.resolved': 'has been resolved:',

      'act.noticeT': 'Your training, with support',
      'act.notice1': 'To help you, your coach, your manager and your company administrators can see your activity in SkillUp: which course and section you are viewing, active time, your test and role-play results and your conversation with the tutor. They can also message you in the chat.',
      'act.notice2': 'Your screen, your keystrokes and your camera are never recorded. If someone follows your session live, you will see their name at the top. This data is kept for 90 days at most.',
      'act.ok': 'Got it', 'act.your': 'Your {role} {name}', 'act.watching1': '{who} is following your session', 'act.watchingN': '{who} and {last} are following your session',
      'act.and': 'and', 'act.whatSee': 'What they see', 'act.manager': 'Your manager', 'act.managerRole': 'Manager', 'act.reply': 'Reply in the chat',

      'priv.title': 'Your data', 'priv.lead': 'What SkillUp keeps about you, what it is used for and who sees it. No small print.',
      'priv.kept': 'What is kept',
      'priv.k1': 'Your conversations with the tutors and what you tell them (interviews, notes, test and role-play answers), in your company account.',
      'priv.k2': 'Your progress: courses, sections, notes, certificates and points.',
      'priv.k3': 'Your usage activity (which page and section you are on, active time): it is deleted automatically after 90 days.',
      'priv.k4': 'Your ratings and suggestions.',
      'priv.use': 'What it is used for',
      'priv.u1': 'So your tutors get to know you and help you better, and so the whole team learns from real cases.',
      'priv.u2': "For your company's learning metrics.",
      'priv.u3': 'The term corrections you make are learnt for your whole company.',
      'priv.u4': 'Chat use is monitored (daily limit and banned words) to prevent abuse and unnecessary cost.',
      'priv.u5': 'Texts are processed by artificial intelligence providers to generate the replies.',
      'priv.who': 'Who sees it',
      'priv.w1': "Your colleagues don't see your conversations.",
      'priv.w2': "Your managers (coach, team leader, your company's admin) can see your progress and read your conversations with the tutors to support you. You will always see a notice with the name of whoever is following your session.",
      'priv.w3': 'Your screen, your keystrokes and your camera are never recorded.',
      'priv.rights': 'Your rights',
      'priv.rightsTx': 'You can download a copy of your data now. To correct or delete it, ask your company, which is the controller of your data; Brandooers processes it on its behalf.',
      'priv.download': 'DOWNLOAD MY DATA', 'priv.preparing': 'PREPARING…', 'priv.done': 'DOWNLOADED', 'priv.err': 'IT DIDN’T WORK: PLEASE TRY AGAIN', 'priv.back': 'Company dashboard',

      'loader.wait': 'One moment…', 'loader.chasing': '{who} is chasing you', 'loader.record': 'Best {n}', 'loader.recordLow': 'best',
      'loader.today': "Today's game: {name} · {hint}", 'loader.next': 'Next time you wait:', 'loader.gameAria': 'Mini-game while you wait: {name}. {hint}',
      'loader.caught': '{who} caught you!', 'loader.points': '{msg} {n} points · tap to play again', 'loader.distract': 'Too many distractions.',
      'loader.crash': 'Diary clash!', 'loader.ate': 'You crashed into {who}!', 'loader.escaped3': 'Three objections got away.',
      'loader.lives': 'Lives', 'loader.escapes': 'Escaped', 'loader.mon': 'MON', 'loader.pricey': 'Too expensive',
      'loader.lines': ['Sharpening the questions…', "Reading what you've told me, without snooping…", 'Throwing out the easy questions…', "Warming up the examiner's brain…", 'Finding the case that will make you think…', 'Removing the trick questions… most of them…', 'Lining up ideas so it takes just the right effort…', 'Asking the tutor not to overdo it…', 'Nearly there: final touches…'],
      'loader.themes': [{ who: 'Monday', obs: ['Meeting', 'Another meeting', 'Cold coffee'] }, { who: 'the inbox', obs: ['RE: RE:', 'Urgent', 'Spam'] }, { who: 'the objection', obs: ["I've no time", 'I already have a supplier', 'Send me info'] }, { who: 'the endless spreadsheet', obs: ['#REF!', 'Merged cell', 'Macro'] }, { who: 'the quarterly KPI', obs: ['Forecast', 'Churn', 'Q4'] }, { who: 'the notification', obs: ['Ping', 'Got 5 mins?', 'Reminder'] }],
      'loader.games': [{ name: 'Run, eyes', hint: 'Tap to jump' }, { name: 'Catch ideas', hint: 'Tap left or right to move' }, { name: 'Fly, eyes', hint: 'Tap to fly' }, { name: 'Objection hunt', hint: 'Tap the objections before they get away' }],
      'lp.Generando tu test…': 'Generating your test…', 'lp.Se prepara solo para ti.': "It's prepared just for you.",
      'lp.Preparando tus preguntas…': 'Preparing your questions…', 'lp.Unos segundos…': 'A few seconds…',
      'lp.Preparando tu examen final…': 'Preparing your final exam…', 'lp.Puede tardar hasta un minuto: se generan preguntas nuevas solo para ti.': 'It can take up to a minute: new questions are generated just for you.',
      'lp.Unos segundos: se generan con lo que has visto y lo que has contado.': "A few seconds: they're generated from what you've seen and what you've told us.",
      'lp.Se acabó el tiempo. Corrigiendo…': "Time's up. Marking…", 'lp.Corrigiendo…': 'Marking…', 'lp.Las respuestas abiertas se corrigen con su rúbrica.': 'Open answers are marked against their rubric.',
      'lp.Preparando el caso y el personaje…': 'Preparing the case and the character…', 'lp.Preparando unas preguntas sobre tu situación…': 'Preparing a few questions about your situation…',
      'lp.Mientras preparo el caso, juega un poco.': 'While I prepare the case, have a little play.',

      'onb.langQ': 'Before we start: which language would you like to use SkillUp in? Everything will adapt: the tutors, the tests, the voice and the videos. You can change it at any time from the menu.',
      'onb.steps': [
        'Hi. Let’s get to know each other in a minute so all this adapts to you. What do you do? Describe your role in detail: what you do, who with and what you decide.',
        'Great. What’s your company’s website? I’ll have a look to get to know you and tailor the examples to your business.',
        'What would you like to achieve with this? Your goal, even in one sentence.',
        'What level do you think you’re at right now?',
        'How do you learn best?',
        'How much time can you give it each week? Be realistic, so I can set a pace you can keep.',
        'What usually holds you back when you learn something new? This helps me support you better.',
        'And finally: how would you like your tutor to talk to you?'
      ],
      'onb.chips': [null, null, null, ['Just starting', 'Experienced', 'Confident'], ['With real examples', 'By practising', 'Watching videos', 'Theory first'], ['Less than 1 hour', '2-3 hours', '5 hours or more'], ['Lack of time', 'I get distracted', "I don't see the point", "I'm shy about practising"], ['Direct and to the point', 'Tactful and calm', 'Challenging me']],
      'onb.reading': 'Give me a second, I’m reading your website…', 'onb.understood': 'This is what I’ve understood about your company:',
      'onb.cantRead': 'I couldn’t read that website, but no problem, let’s carry on.', 'onb.company': 'Your company',
      'onb.done': 'Done, I know you a little now. Now let’s discover your learning DNA: a few quick questions and you’ll get your archetype and your certificate. When you finish, your path opens.',
      'onb.dna': 'Discover my DNA', 'onb.ph': 'Type or dictate your answer…', 'onb.send': 'Send', 'onb.answer': 'Answer', 'onb.guide': 'Your guide', 'onb.loading': 'Loading…',
      'onb.vTitle': 'Welcome to SkillUp', 'onb.vStart': 'Start', 'onb.vSkip': 'Skip the video',
      'onb.vText': 'Before you start, take a moment to watch it: how you will learn with cases from your role, how you show you apply it, the challenges your manager will set, the follow-up and support you will have, and why this training really sticks. (Video in Spanish.)',

      'vid.lang': 'Video language',
      'vid.title': 'Videos', 'vid.back': '← Back', 'vid.hero': 'Learn by watching',
      'vid.heroSub': 'A real YouTube selection on what you’re studying, nothing made up: every video with its real views and likes.',
      'vid.heroTopic': 'A real YouTube selection on this topic, nothing made up.',
      'vid.all': 'All', 'vid.recent': 'Recent', 'vid.mostViewed': 'Most viewed', 'vid.topRated': 'Top rated',
      'vid.newOn': 'New on {t}', 'vid.justOut': 'just published', 'vid.newT': 'New', 'vid.newSub': 'just published on YouTube',
      'vid.forYou': 'For you', 'vid.forYouSub': 'based on your learning path', 'vid.favsSub': 'what your team watches most inside SkillUp',
      'vid.ratedSub': 'quality score: likes and comments per view, reach and channel',
      'vid.views': 'views', 'vid.likes': 'likes', 'vid.inSkillup': 'in SkillUp', 'vid.like': 'Like', 'vid.dislike': 'Dislike', 'vid.hide': 'Don’t show again', 'vid.similar': 'Similar',
      'vid.empty': 'No videos to show here in this language yet. Try another language or come back later.', 'vid.emptyIn': 'No videos in {x} yet.',
      'vid.searching': 'Searching for videos…', 'vid.err': 'The videos could not be loaded right now.', 'vid.loadErr': "Couldn't load. Please log in again.",
      'cv.title': 'Course videos', 'cv.sub': 'Real YouTube selection · {c}', 'cv.all': 'See all', 'cv.close': 'Close videos', 'cv.views': 'views',
      'cv.block': 'This section', 'cv.empty': 'No videos for this course in this language yet. Try another language.', 'cv.err': 'The videos could not be loaded right now.', 'cv.retry': 'Try again',
      'cv.btn': 'Videos',
      'tx.auto': 'Automatically translated', 'tx.seeOrig': 'see original', 'tx.orig': 'Original in Spanish', 'tx.seeTr': 'see translation', 'tx.working': 'Translating this section…', 'tx.fail': 'This section could not be translated; showing the Spanish original.'
    },

    ca: {
      "cr.title": "Crèdits de creació",
      "cr.credits": "{n} crèdits",
      "cr.perMin": " / min",
      "cr.soon": "Properament",
      "cr.locked": "En arribar al nivell Coach (N4) en una competència desbloqueges la creació amb IA per a la teva empresa. Això és el que podràs crear:",
      "cr.balance": "Saldo de la teva empresa. Això és el que pots crear:",
      "cr.topic": "Tema del curs, p. ex. «Negociar amb proveïdors»",
      "cr.create": "Crear curs amb IA",
      "cr.buy": "Comprar crèdits",
      "cr.needTopic": "Escriu el tema del curs.",
      "cr.working": "El panell d'experts està escrivint i revisant el curs…",
      "cr.gate": "Crear aquest curs costa {c} crèdits. A la teva empresa li queden {b}.",
      "cr.confirm": "Confirmar",
      "cr.spent": "Gastats {s} crèdits · en queden {b}.",
      "cr.draft": "Veure l'esborrany",
      "cr.item.voz_narrada": "Veu narrada",
      "cr.item.avatar_estandar": "Vídeo amb avatar estàndard (HeyGen Avatar IV)",
      "cr.item.avatar_realista": "Vídeo amb avatar realista (HeyGen Avatar V)",
      "cr.item.avatar_propio": "Crear el teu avatar",
      "cr.item.clonar_voz": "Clonar la teva veu",
      "cr.item.curso_ia": "Crear un curs amb IA (panell d'experts)",

      'nav.dashboard': 'El meu tauler', 'nav.courses': 'Formacions', 'nav.explore': 'Explorar', 'nav.videos': 'Vídeos', 'nav.roleplays': 'Jocs de rol',
      'nav.ranking': 'Rànquing', 'nav.certs': 'Certificats', 'nav.teamdna': 'Team DNA', 'nav.help': 'Ajuda', 'nav.privacy': 'Les teves dades',
      'nav.assign': 'Assignar proves', 'nav.validate': 'Validar casos', 'nav.metrics': 'Mètriques i insights', 'nav.live': 'En directe',
      'nav.company': "Tauler d'empresa", 'nav.chatuse': 'Ús del xat', 'nav.pyramids': 'Piràmides', 'nav.roi': 'Informe de ROI',
      'nav.feedback': 'Feedback', 'nav.console': 'Consola', 'nav.suggest': 'Enviar un suggeriment', 'nav.suggestB': 'Enviar un suggeriment a Brandooers',
      'nav.exit': 'Sortir', 'nav.open': 'Obrir el menú', 'nav.close': 'Tancar', 'nav.nav': 'Navegació', 'nav.lang': 'Idioma',
      'nav.langSaved': 'Idioma desat', 'nav.langErr': "No s'ha pogut desar l'idioma",

      'eyes.fab': "Obrir l'assistent de Brandooers", 'eyes.fabTitle': "Toca per obrir l'assistent · mantén premut per parlar-hi directament",
      'eyes.title': 'Assistent', 'eyes.voice': 'Veu', 'eyes.read': 'Llegir les respostes en veu alta', 'eyes.home': 'Menú principal', 'eyes.homeAria': 'Anar al menú principal',
      'eyes.close': 'Tancar', 'eyes.dictate': 'Dictar', 'eyes.talk': 'Parlar', 'eyes.placeholder': 'Escriu o parla…', 'eyes.msg': 'Missatge', 'eyes.send': 'Enviar',
      'eyes.tutors': 'Els teus tutors', 'eyes.tutorOf': 'Tutor de {x}', 'eyes.openCourse': 'Obrir el curs de {x}',
      'eyes.spec.Comercial': 'Comercial', 'eyes.spec.Marketing': 'Màrqueting', 'eyes.spec.Negociación': 'Negociació', 'eyes.spec.Acompañamiento': 'Acompanyament',
      'eyes.micPerm': "Necessito permís per fer servir el micròfon. Activa'l a la configuració del navegador, o escriu-me aquí.",
      'eyes.micNone': 'No trobo el micròfon d’aquest dispositiu. Pots escriure’m aquí.',
      'eyes.micNA': 'El dictat per veu no està disponible ara mateix en aquest navegador. Escriu-me i et responc.',
      'eyes.hello': 'Hola', 'eyes.fallback': "Hola{name}. Sóc el teu guia a Brandooers. Digues-me el teu objectiu o pregunta'm per on començar.",
      'eyes.down': "Ara mateix no puc respondre (el servei d'IA no està disponible). Torna-ho a provar d'aquí a un moment.",
      'eyes.noVoice': "Aquest navegador no permet parlar-me per veu. Toca els ulls i escriu-me.",
      'eyes.listening': "T'escolto…", 'eyes.micPerm2': "Necessito permís per fer servir el micròfon. Activa'l a la configuració del navegador.",
      'eyes.notHeard': "No t'he sentit. Mantén premuts els ulls mentre parles.", 'eyes.cantAnswer': "Ara mateix no puc respondre. Torna-ho a provar d'aquí a un moment.",
      'eyes.mute': 'Silenciar la veu dels agents', 'eyes.unmute': 'Activar la veu dels agents', 'eyes.voiceOff': 'Silenciar la veu', 'eyes.voiceOn': 'Que em parli en veu alta',
      'eyes.g.inicio': "Aquí veus el teu progrés i els teus cursos. Toca una targeta per continuar on ho vas deixar.",
      'eyes.g.ruta': 'Aquest és el teu mapa de coneixement. Passa el ratolí per les bombolles i fes clic per entrar en un tema.',
      'eyes.g.explorar': "Pregunta'm el que vulguis, o busca un curs. Et deixo recursos aquí al costat de la resposta.",
      'eyes.g.workforce': 'Aquí veus com aprèn tot l’equip, agrupat segons com aporta cadascú.',

      'dict.listening': "T'escolto · toca per acabar", 'dict.convo': 'Conversa activa · toca per acabar', 'dict.talk': 'Parlar',

      'fb.useful': 'Resposta útil', 'fb.improvable': 'Resposta millorable', 'fb.thanks': 'Gràcies', 'fb.saveErr': "No s'ha pogut desar",
      'fb.what': 'Què ha fallat? Ens ajuda a millorar.', 'fb.reason': 'Motiu', 'fb.comment': 'Comentari (opcional)', 'fb.send': 'Enviar', 'fb.cancel': 'Cancel·lar',
      'fb.r.dato_incorrecto': 'Dada incorrecta', 'fb.r.fuera_de_tema': 'Fora de tema', 'fb.r.no_lo_entiendo': "No ho entenc",
      'fb.r.voz': 'La veu sona malament o falla', 'fb.r.palabra_mal_escrita': 'Paraula mal escrita', 'fb.r.otro': 'Altres',
      'fb.t.sugerencia': 'Suggeriment', 'fb.t.error': 'Error', 'fb.t.contenido': 'Petició de contingut', 'fb.t.otro': 'Altres',
      'fb.s.nuevo': 'Rebut', 'fb.s.en_revision': 'En revisió', 'fb.s.resuelto': 'Resolt', 'fb.s.descartado': 'Descartat',
      'fb.titleAdmin': 'Enviar un suggeriment a Brandooers', 'fb.title': 'Enviar un suggeriment',
      'fb.subAdmin': "Explica'ns què milloraries de la plataforma per a la teva empresa. Ho llegeix l'equip de Brandooers.",
      'fb.sub': 'Una idea, un error o un contingut que trobes a faltar. Ho llegim tot.',
      'fb.type': 'Tipus', 'fb.yourMsg': 'El teu missatge', 'fb.ph': 'Escriu aquí…',
      'fb.ctx': "S'adjunta automàticament la pàgina, el teu rol, la teva empresa i el navegador. Res més.",
      'fb.close': 'Tancar', 'fb.mine': 'El que ja has enviat', 'fb.more': 'Escriu una mica més', 'fb.sendErr': "No s'ha pogut enviar",
      'fb.ok': "Gràcies. Ho hem rebut i t'avisarem quan estigui resolt.", 'fb.rated': 'Resposta valorada',
      'fb.yourSug': 'El teu suggeriment', 'fb.yourRating': 'La teva valoració', 'fb.resolved': "s'ha resolt:",

      'act.noticeT': 'La teva formació, amb acompanyament',
      'act.notice1': "Per poder ajudar-te, el teu coach, el teu responsable i l'administració de la teva empresa poden veure la teva activitat a SkillUp: quin curs i secció estàs veient, el temps actiu, els resultats dels tests i jocs de rol i la teva conversa amb el tutor. També et poden escriure al xat.",
      'act.notice2': "Mai no es grava la teva pantalla, el que teclejes ni la teva càmera. Si algú segueix la teva sessió en directe, ho veuràs a dalt amb el seu nom. Aquestes dades es guarden 90 dies com a màxim.",
      'act.ok': 'Entesos', 'act.your': 'El teu {role} {name}', 'act.watching1': '{who} està seguint la teva sessió', 'act.watchingN': '{who} i {last} estan seguint la teva sessió',
      'act.and': 'i', 'act.whatSee': 'Què veu', 'act.manager': 'El teu responsable', 'act.managerRole': 'Responsable', 'act.reply': 'Respondre al xat',

      'priv.title': 'Les teves dades', 'priv.lead': 'Què guarda SkillUp de tu, per a què ho fa servir i qui ho veu. Sense lletra petita.',
      'priv.kept': 'Què es guarda',
      'priv.k1': 'Les teves converses amb els tutors i el que els expliques (entrevistes, notes, respostes de tests i jocs de rol), al compte de la teva empresa.',
      'priv.k2': 'El teu progrés: cursos, blocs, notes, certificats i punts.',
      'priv.k3': "La teva activitat d'ús (en quina pàgina i secció ets, temps actiu): s'esborra sola als 90 dies.",
      'priv.k4': 'Les teves valoracions i suggeriments.',
      'priv.use': 'Per a què es fa servir',
      'priv.u1': "Perquè els teus tutors et coneguin i t'ajudin millor, i perquè tot l'equip aprengui de casos reals.",
      'priv.u2': "Per a les mètriques d'aprenentatge de la teva empresa.",
      'priv.u3': "Les correccions de termes que fas s'aprenen per a tota la teva empresa.",
      'priv.u4': "L'ús del xat es controla (límit diari i paraules prohibides) per evitar abusos i despesa innecessària.",
      'priv.u5': "Els textos es processen amb proveïdors d'intel·ligència artificial per generar les respostes.",
      'priv.who': 'Qui ho veu',
      'priv.w1': 'Els teus companys no veuen les teves converses.',
      'priv.w2': "Els teus responsables (coach, team leader, admin de la teva empresa) poden veure el teu progrés i llegir les teves converses amb els tutors per donar-te suport. Sempre veuràs un avís amb el nom de qui segueixi la teva sessió.",
      'priv.w3': 'Mai no es grava la teva pantalla, el que teclejes ni la teva càmera.',
      'priv.rights': 'Els teus drets',
      'priv.rightsTx': "Pots descarregar ara una còpia de les teves dades. Per corregir-les o esborrar-les, demana-ho a la teva empresa, que és la responsable de les teves dades; Brandooers les tracta per encàrrec seu.",
      'priv.download': 'DESCARREGAR LES MEVES DADES', 'priv.preparing': 'PREPARANT…', 'priv.done': 'DESCARREGAT', 'priv.err': "NO S'HA POGUT: TORNA-HO A PROVAR", 'priv.back': "Tauler d'empresa",

      'loader.wait': 'Un moment…', 'loader.chasing': 'et persegueix {who}', 'loader.record': 'Rècord {n}', 'loader.recordLow': 'rècord',
      'loader.today': "Joc d'avui: {name} · {hint}", 'loader.next': 'A la pròxima espera:', 'loader.gameAria': 'Minijoc mentre esperes: {name}. {hint}',
      'loader.caught': "T'ha enxampat {who}!", 'loader.points': '{msg} {n} punts · toca per repetir', 'loader.distract': 'Massa distraccions.',
      'loader.crash': "Xoc d'agendes!", 'loader.ate': "T'has menjat {who}!", 'loader.escaped3': "Se t'han escapat tres objeccions.",
      'loader.lives': 'Vides', 'loader.escapes': 'Escapades', 'loader.mon': 'DLL', 'loader.pricey': 'És molt car',
      'loader.lines': ['Esmolant les preguntes…', 'Llegint el que has explicat, sense xafardejar…', 'Descartant les preguntes fàcils…', "Escalfant la neurona de l'examinador…", 'Buscant el cas que més et faci pensar…', 'Traient les trampes… gairebé totes…', 'Ordenant idees perquè et costi el just…', 'Demanant al tutor que no es passi…', 'Gairebé ja està: últims retocs…'],
      'loader.themes': [{ who: 'el dilluns', obs: ['Reunió', 'Una altra reunió', 'Cafè fred'] }, { who: "la safata d'entrada", obs: ['RE: RE:', 'Urgent', 'Correu brossa'] }, { who: "l'objecció", obs: ['No tinc temps', 'Ja tinc proveïdor', "Envia'm informació"] }, { who: "l'Excel infinit", obs: ['#REF!', 'Cel·la combinada', 'Macro'] }, { who: 'el KPI del trimestre', obs: ['Forecast', 'Churn', 'Q4'] }, { who: 'la notificació', obs: ['Ping', 'Tens 5 min?', 'Recordatori'] }],
      'loader.games': [{ name: 'Corre, ulls', hint: 'Toca per saltar' }, { name: 'Atrapa idees', hint: "Toca a un costat o a l'altre per moure't" }, { name: 'Vola, ulls', hint: 'Toca per volar' }, { name: 'Caça objeccions', hint: "Toca les objeccions abans que s'escapin" }],
      'lp.Generando tu test…': 'Generant el teu test…', 'lp.Se prepara solo para ti.': "Es prepara només per a tu.",
      'lp.Preparando tus preguntas…': 'Preparant les teves preguntes…', 'lp.Unos segundos…': 'Uns segons…',
      'lp.Preparando tu examen final…': 'Preparant el teu examen final…', 'lp.Puede tardar hasta un minuto: se generan preguntas nuevas solo para ti.': 'Pot trigar fins a un minut: es generen preguntes noves només per a tu.',
      'lp.Unos segundos: se generan con lo que has visto y lo que has contado.': 'Uns segons: es generen amb el que has vist i el que has explicat.',
      'lp.Se acabó el tiempo. Corrigiendo…': "S'ha acabat el temps. Corregint…", 'lp.Corrigiendo…': 'Corregint…', 'lp.Las respuestas abiertas se corrigen con su rúbrica.': 'Les respostes obertes es corregeixen amb la seva rúbrica.',
      'lp.Preparando el caso y el personaje…': 'Preparant el cas i el personatge…', 'lp.Preparando unas preguntas sobre tu situación…': 'Preparant unes preguntes sobre la teva situació…',
      'lp.Mientras preparo el caso, juega un poco.': 'Mentre preparo el cas, juga una mica.',

      'onb.langQ': "Abans de començar: en quin idioma vols fer servir SkillUp? Tot s'hi adaptarà: els tutors, els tests, la veu i els vídeos. El pots canviar quan vulguis des del menú.",
      'onb.steps': [
        "Hola. Coneguem-nos en un minut perquè tot això s'adapti a tu. A què et dediques? Descriu-me el teu lloc amb detall: què fas, amb qui i què decideixes.",
        "Genial. Quin és el web de la teva empresa? Hi faig un cop d'ull per conèixer-vos i ajustar els exemples al que feu.",
        "Què t'agradaria aconseguir amb això? El teu objectiu, encara que sigui en una frase.",
        'En quin nivell et veus ara mateix?',
        'Com aprens millor?',
        "Quant de temps hi pots dedicar a la setmana? Sigues realista, així et marco un ritme que puguis complir.",
        "Què et sol frenar quan aprens una cosa nova? Això m'ajuda a acompanyar-te millor.",
        'I per acabar: com prefereixes que et parli el teu tutor?'
      ],
      'onb.chips': [null, null, null, ['Començant', 'Amb experiència', 'Amb soltesa'], ['Amb exemples reals', 'Practicant', 'Mirant vídeos', 'Primer la teoria'], ["Menys d'1 hora", '2-3 hores', '5 hores o més'], ['Falta de temps', 'Em disperso', 'No hi veig el sentit', 'Em fa vergonya practicar'], ['Directe i al gra', 'Amb tacte i calma', 'Posant-me reptes']],
      'onb.reading': "Dona'm un segon, estic llegint el vostre web…", 'onb.understood': "Això és el que he entès de la vostra empresa:",
      'onb.cantRead': "No he pogut llegir aquest web, però no passa res, continuem.", 'onb.company': 'La teva empresa',
      'onb.done': "Llest, ja et conec una mica. Ara descobrim el teu ADN d'aprenentatge: unes preguntes ràpides i tindràs el teu arquetip i el teu certificat. En acabar s'obre la teva ruta.",
      'onb.dna': 'Descobrir el meu ADN', 'onb.ph': 'Escriu o dicta la teva resposta…', 'onb.send': 'Enviar', 'onb.answer': 'Resposta', 'onb.guide': 'El teu guia', 'onb.loading': 'Carregant…',
      'onb.vTitle': 'Benvingut a SkillUp', 'onb.vStart': 'Començar', 'onb.vSkip': 'Saltar el vídeo',
      'onb.vText': "Abans de començar, mira-te'l un moment: com aprendràs amb casos del teu lloc, com demostres que ho aplicas, els reptes que et proposarà el teu responsable, el seguiment i el suport que tindràs, i per què aquesta formació sí que se't queda. (Vídeo en castellà.)",

      'vid.lang': 'Idioma dels vídeos',
      'vid.title': 'Vídeos', 'vid.back': '← Tornar', 'vid.hero': 'Aprèn mirant',
      'vid.heroSub': 'Selecció real de YouTube sobre el que estàs estudiant, res inventat: tots amb les seves visualitzacions i valoracions reals.',
      'vid.heroTopic': 'Selecció real de YouTube sobre aquest tema, res inventat.',
      'vid.all': 'Tot', 'vid.recent': 'Recents', 'vid.mostViewed': 'Més vistos', 'vid.topRated': 'Més ben valorats',
      'vid.newOn': 'Novetats sobre {t}', 'vid.justOut': 'acabats de publicar', 'vid.newT': 'Novetats', 'vid.newSub': 'acabats de publicar a YouTube',
      'vid.forYou': 'Per a tu', 'vid.forYouSub': "segons la teva ruta d'aprenentatge", 'vid.favsSub': "el més vist pel teu equip dins d'SkillUp",
      'vid.ratedSub': "nota de qualitat: m'agrada i comentaris per visualització, abast i canal",
      'vid.views': 'visualitzacions', 'vid.likes': "m'agrada", 'vid.inSkillup': 'a SkillUp', 'vid.like': "M'agrada", 'vid.dislike': "No m'agrada", 'vid.hide': 'No mostrar més', 'vid.similar': 'Semblants',
      'vid.empty': "Encara no hi ha vídeos en aquest idioma per mostrar aquí. Prova un altre idioma o torna d'aquí a una estona.", 'vid.emptyIn': 'Encara no hi ha vídeos a {x}.',
      'vid.searching': 'Buscant vídeos…', 'vid.err': "No s'han pogut carregar els vídeos ara mateix.", 'vid.loadErr': "No s'ha pogut carregar. Torna a entrar.",
      'cv.title': 'Vídeos del curs', 'cv.sub': 'Selecció real de YouTube · {c}', 'cv.all': 'Veure-ho tot', 'cv.close': 'Tancar els vídeos', 'cv.views': 'visualitzacions',
      'cv.block': 'Aquest bloc', 'cv.empty': 'Encara no hi ha vídeos per a aquest curs en aquest idioma. Prova un altre idioma.', 'cv.err': "No s'han pogut carregar els vídeos ara mateix.", 'cv.retry': 'Tornar-ho a provar',
      'cv.btn': 'Vídeos',
      'tx.auto': 'Traduït automàticament', 'tx.seeOrig': "veure l'original", 'tx.orig': 'Original en castellà', 'tx.seeTr': 'veure la traducció', 'tx.working': 'Traduint aquesta secció…', 'tx.fail': "No s'ha pogut traduir aquesta secció; es mostra l'original en castellà."
    },

    pt: {
      "cr.title": "Créditos de criação",
      "cr.credits": "{n} créditos",
      "cr.perMin": " / min",
      "cr.soon": "Em breve",
      "cr.locked": "Ao chegar ao nível Coach (N4) numa competência, desbloqueias a criação com IA para a tua empresa. Isto é o que vais poder criar:",
      "cr.balance": "Saldo da tua empresa. Isto é o que podes criar:",
      "cr.topic": "Tema do curso, p. ex. «Negociar com fornecedores»",
      "cr.create": "Criar curso com IA",
      "cr.buy": "Comprar créditos",
      "cr.needTopic": "Escreve o tema do curso.",
      "cr.working": "O painel de especialistas está a escrever e a rever o curso…",
      "cr.gate": "Criar este curso custa {c} créditos. A tua empresa tem {b}.",
      "cr.confirm": "Confirmar",
      "cr.spent": "{s} créditos gastos · restam {b}.",
      "cr.draft": "Ver rascunho",
      "cr.item.voz_narrada": "Voz narrada",
      "cr.item.avatar_estandar": "Vídeo com avatar padrão (HeyGen Avatar IV)",
      "cr.item.avatar_realista": "Vídeo com avatar realista (HeyGen Avatar V)",
      "cr.item.avatar_propio": "Criar o teu avatar",
      "cr.item.clonar_voz": "Clonar a tua voz",
      "cr.item.curso_ia": "Criar um curso com IA (painel de especialistas)",

      'nav.dashboard': 'O meu painel', 'nav.courses': 'Formações', 'nav.explore': 'Explorar', 'nav.videos': 'Vídeos', 'nav.roleplays': 'Role-plays',
      'nav.ranking': 'Classificação', 'nav.certs': 'Certificados', 'nav.teamdna': 'Team DNA', 'nav.help': 'Ajuda', 'nav.privacy': 'Os teus dados',
      'nav.assign': 'Atribuir provas', 'nav.validate': 'Validar casos', 'nav.metrics': 'Métricas e insights', 'nav.live': 'Em direto',
      'nav.company': 'Painel da empresa', 'nav.chatuse': 'Utilização do chat', 'nav.pyramids': 'Pirâmides', 'nav.roi': 'Relatório de ROI',
      'nav.feedback': 'Feedback', 'nav.console': 'Consola', 'nav.suggest': 'Enviar uma sugestão', 'nav.suggestB': 'Enviar uma sugestão à Brandooers',
      'nav.exit': 'Sair', 'nav.open': 'Abrir o menu', 'nav.close': 'Fechar', 'nav.nav': 'Navegação', 'nav.lang': 'Idioma',
      'nav.langSaved': 'Idioma guardado', 'nav.langErr': 'Não foi possível guardar o idioma',

      'eyes.fab': 'Abrir o assistente Brandooers', 'eyes.fabTitle': 'Toca para abrir o assistente · mantém premido para lhe falar diretamente',
      'eyes.title': 'Assistente', 'eyes.voice': 'Voz', 'eyes.read': 'Ler as respostas em voz alta', 'eyes.home': 'Menu principal', 'eyes.homeAria': 'Ir para o menu principal',
      'eyes.close': 'Fechar', 'eyes.dictate': 'Ditar', 'eyes.talk': 'Falar', 'eyes.placeholder': 'Escreve ou fala…', 'eyes.msg': 'Mensagem', 'eyes.send': 'Enviar',
      'eyes.tutors': 'Os teus tutores', 'eyes.tutorOf': 'Tutor de {x}', 'eyes.openCourse': 'Abrir o curso de {x}',
      'eyes.spec.Comercial': 'Vendas', 'eyes.spec.Marketing': 'Marketing', 'eyes.spec.Negociación': 'Negociação', 'eyes.spec.Acompañamiento': 'Acompanhamento',
      'eyes.micPerm': 'Preciso de autorização para usar o microfone. Ativa-a nas definições do navegador, ou escreve-me aqui.',
      'eyes.micNone': 'Não encontro o microfone deste dispositivo. Podes escrever-me aqui.',
      'eyes.micNA': 'O ditado por voz não está disponível neste navegador neste momento. Escreve-me e eu respondo.',
      'eyes.hello': 'Olá', 'eyes.fallback': 'Olá{name}. Sou o teu guia na Brandooers. Diz-me o teu objetivo ou pergunta-me por onde começar.',
      'eyes.down': 'Neste momento não consigo responder (o serviço de IA não está disponível). Tenta novamente daqui a pouco.',
      'eyes.noVoice': 'Este navegador não permite falares comigo por voz. Toca nos olhos e escreve-me.',
      'eyes.listening': 'Estou a ouvir-te…', 'eyes.micPerm2': 'Preciso de autorização para usar o microfone. Ativa-a nas definições do navegador.',
      'eyes.notHeard': 'Não te ouvi. Mantém os olhos premidos enquanto falas.', 'eyes.cantAnswer': 'Neste momento não consigo responder. Tenta novamente daqui a pouco.',
      'eyes.mute': 'Silenciar a voz dos agentes', 'eyes.unmute': 'Ativar a voz dos agentes', 'eyes.voiceOff': 'Silenciar a voz', 'eyes.voiceOn': 'Falar-me em voz alta',
      'eyes.g.inicio': 'Aqui vês o teu progresso e os teus cursos. Toca num cartão para continuares onde ficaste.',
      'eyes.g.ruta': 'Este é o teu mapa de conhecimento. Passa o rato pelas bolhas e clica para entrar num tema.',
      'eyes.g.explorar': 'Pergunta-me o que quiseres, ou procura um curso. Deixo-te recursos aqui ao lado da resposta.',
      'eyes.g.workforce': 'Aqui vês como aprende toda a equipa, agrupada pela forma como cada pessoa contribui.',

      'dict.listening': 'Estou a ouvir · toca para terminar', 'dict.convo': 'Conversa ativa · toca para terminar', 'dict.talk': 'Falar',

      'fb.useful': 'Resposta útil', 'fb.improvable': 'Resposta a melhorar', 'fb.thanks': 'Obrigado', 'fb.saveErr': 'Não foi possível guardar',
      'fb.what': 'O que falhou? Ajuda-nos a melhorar.', 'fb.reason': 'Motivo', 'fb.comment': 'Comentário (opcional)', 'fb.send': 'Enviar', 'fb.cancel': 'Cancelar',
      'fb.r.dato_incorrecto': 'Dado incorreto', 'fb.r.fuera_de_tema': 'Fora do tema', 'fb.r.no_lo_entiendo': 'Não percebo',
      'fb.r.voz': 'A voz soa mal ou falha', 'fb.r.palabra_mal_escrita': 'Palavra mal escrita', 'fb.r.otro': 'Outro',
      'fb.t.sugerencia': 'Sugestão', 'fb.t.error': 'Erro', 'fb.t.contenido': 'Pedido de conteúdo', 'fb.t.otro': 'Outro',
      'fb.s.nuevo': 'Recebido', 'fb.s.en_revision': 'Em revisão', 'fb.s.resuelto': 'Resolvido', 'fb.s.descartado': 'Descartado',
      'fb.titleAdmin': 'Enviar uma sugestão à Brandooers', 'fb.title': 'Enviar uma sugestão',
      'fb.subAdmin': 'Diz-nos o que melhorarias na plataforma para a tua empresa. A equipa da Brandooers lê tudo.',
      'fb.sub': 'Uma ideia, um erro ou um conteúdo que te faz falta. Lemos tudo.',
      'fb.type': 'Tipo', 'fb.yourMsg': 'A tua mensagem', 'fb.ph': 'Escreve aqui…',
      'fb.ctx': 'São anexados automaticamente a página, a tua função, a tua empresa e o navegador. Mais nada.',
      'fb.close': 'Fechar', 'fb.mine': 'O que já enviaste', 'fb.more': 'Escreve um pouco mais', 'fb.sendErr': 'Não foi possível enviar',
      'fb.ok': 'Obrigado. Recebemos e vamos avisar-te quando estiver resolvido.', 'fb.rated': 'Resposta avaliada',
      'fb.yourSug': 'A tua sugestão', 'fb.yourRating': 'A tua avaliação', 'fb.resolved': 'foi resolvida:',

      'act.noticeT': 'A tua formação, com acompanhamento',
      'act.notice1': 'Para te poderem ajudar, o teu coach, o teu responsável e a administração da tua empresa podem ver a tua atividade no SkillUp: que curso e secção estás a ver, o tempo ativo, os resultados dos testes e role-plays e a tua conversa com o tutor. Também te podem escrever no chat.',
      'act.notice2': 'Nunca é gravado o teu ecrã, o que escreves no teclado nem a tua câmara. Se alguém acompanhar a tua sessão em direto, verás o nome dessa pessoa no topo. Estes dados são guardados durante 90 dias, no máximo.',
      'act.ok': 'Entendido', 'act.your': 'O teu {role} {name}', 'act.watching1': '{who} está a acompanhar a tua sessão', 'act.watchingN': '{who} e {last} estão a acompanhar a tua sessão',
      'act.and': 'e', 'act.whatSee': 'O que vê', 'act.manager': 'O teu responsável', 'act.managerRole': 'Responsável', 'act.reply': 'Responder no chat',

      'priv.title': 'Os teus dados', 'priv.lead': 'O que o SkillUp guarda sobre ti, para que o usa e quem o vê. Sem letras pequenas.',
      'priv.kept': 'O que é guardado',
      'priv.k1': 'As tuas conversas com os tutores e o que lhes contas (entrevistas, notas, respostas de testes e role-plays), na conta da tua empresa.',
      'priv.k2': 'O teu progresso: cursos, blocos, notas, certificados e pontos.',
      'priv.k3': 'A tua atividade de utilização (em que página e secção estás, tempo ativo): é apagada automaticamente ao fim de 90 dias.',
      'priv.k4': 'As tuas avaliações e sugestões.',
      'priv.use': 'Para que é usado',
      'priv.u1': 'Para que os teus tutores te conheçam e te ajudem melhor, e para que toda a equipa aprenda com casos reais.',
      'priv.u2': 'Para as métricas de aprendizagem da tua empresa.',
      'priv.u3': 'As correções de termos que fazes são aprendidas para toda a tua empresa.',
      'priv.u4': 'A utilização do chat é controlada (limite diário e palavras proibidas) para evitar abusos e gastos desnecessários.',
      'priv.u5': 'Os textos são processados por fornecedores de inteligência artificial para gerar as respostas.',
      'priv.who': 'Quem o vê',
      'priv.w1': 'Os teus colegas não veem as tuas conversas.',
      'priv.w2': 'Os teus responsáveis (coach, team leader, admin da tua empresa) podem ver o teu progresso e ler as tuas conversas com os tutores para te apoiar. Verás sempre um aviso com o nome de quem acompanhar a tua sessão.',
      'priv.w3': 'Nunca é gravado o teu ecrã, o que escreves no teclado nem a tua câmara.',
      'priv.rights': 'Os teus direitos',
      'priv.rightsTx': 'Podes descarregar já uma cópia dos teus dados. Para os corrigir ou apagar, pede à tua empresa, que é a responsável pelos teus dados; a Brandooers trata-os por conta dela.',
      'priv.download': 'DESCARREGAR OS MEUS DADOS', 'priv.preparing': 'A PREPARAR…', 'priv.done': 'DESCARREGADO', 'priv.err': 'NÃO FOI POSSÍVEL: TENTA NOVAMENTE', 'priv.back': 'Painel da empresa',

      'loader.wait': 'Um momento…', 'loader.chasing': 'persegue-te {who}', 'loader.record': 'Recorde {n}', 'loader.recordLow': 'recorde',
      'loader.today': 'Jogo de hoje: {name} · {hint}', 'loader.next': 'Na próxima espera:', 'loader.gameAria': 'Minijogo enquanto esperas: {name}. {hint}',
      'loader.caught': 'Apanhou-te {who}!', 'loader.points': '{msg} {n} pontos · toca para repetir', 'loader.distract': 'Demasiadas distrações.',
      'loader.crash': 'Choque de agendas!', 'loader.ate': 'Chocaste com {who}!', 'loader.escaped3': 'Escaparam-te três objeções.',
      'loader.lives': 'Vidas', 'loader.escapes': 'Fugas', 'loader.mon': 'SEG', 'loader.pricey': 'É muito caro',
      'loader.lines': ['A afiar as perguntas…', 'A ler o que contaste, sem bisbilhotar…', 'A pôr de lado as perguntas fáceis…', 'A aquecer o neurónio do examinador…', 'A procurar o caso que mais te faça pensar…', 'A tirar as rasteiras… quase todas…', 'A arrumar ideias para te custar o justo…', 'A pedir ao tutor que não exagere…', 'Está quase: últimos retoques…'],
      'loader.themes': [{ who: 'a segunda-feira', obs: ['Reunião', 'Outra reunião', 'Café frio'] }, { who: 'a caixa de entrada', obs: ['RE: RE:', 'Urgente', 'Spam'] }, { who: 'a objeção', obs: ['Não tenho tempo', 'Já tenho fornecedor', 'Manda-me informação'] }, { who: 'o Excel infinito', obs: ['#REF!', 'Célula unida', 'Macro'] }, { who: 'o KPI do trimestre', obs: ['Forecast', 'Churn', 'Q4'] }, { who: 'a notificação', obs: ['Ping', 'Tens 5 min?', 'Lembrete'] }],
      'loader.games': [{ name: 'Corre, olhos', hint: 'Toca para saltar' }, { name: 'Apanha ideias', hint: 'Toca de um lado ou do outro para te mexeres' }, { name: 'Voa, olhos', hint: 'Toca para voar' }, { name: 'Caça objeções', hint: 'Toca nas objeções antes que fujam' }],
      'lp.Generando tu test…': 'A gerar o teu teste…', 'lp.Se prepara solo para ti.': 'É preparado só para ti.',
      'lp.Preparando tus preguntas…': 'A preparar as tuas perguntas…', 'lp.Unos segundos…': 'Uns segundos…',
      'lp.Preparando tu examen final…': 'A preparar o teu exame final…', 'lp.Puede tardar hasta un minuto: se generan preguntas nuevas solo para ti.': 'Pode demorar até um minuto: são geradas perguntas novas só para ti.',
      'lp.Unos segundos: se generan con lo que has visto y lo que has contado.': 'Uns segundos: são geradas com o que viste e o que contaste.',
      'lp.Se acabó el tiempo. Corrigiendo…': 'Acabou o tempo. A corrigir…', 'lp.Corrigiendo…': 'A corrigir…', 'lp.Las respuestas abiertas se corrigen con su rúbrica.': 'As respostas abertas são corrigidas com a respetiva rubrica.',
      'lp.Preparando el caso y el personaje…': 'A preparar o caso e a personagem…', 'lp.Preparando unas preguntas sobre tu situación…': 'A preparar umas perguntas sobre a tua situação…',
      'lp.Mientras preparo el caso, juega un poco.': 'Enquanto preparo o caso, joga um pouco.',

      'onb.langQ': 'Antes de começarmos: em que idioma queres usar o SkillUp? Tudo se vai adaptar: os tutores, os testes, a voz e os vídeos. Podes mudá-lo quando quiseres a partir do menu.',
      'onb.steps': [
        'Olá. Vamos conhecer-nos num minuto para que tudo isto se adapte a ti. O que fazes? Descreve-me a tua função com detalhe: o que fazes, com quem e o que decides.',
        'Ótimo. Qual é o site da tua empresa? Vou dar uma vista de olhos para vos conhecer e ajustar os exemplos ao vosso negócio.',
        'O que gostarias de conseguir com isto? O teu objetivo, nem que seja numa frase.',
        'Em que nível te vês neste momento?',
        'Como é que aprendes melhor?',
        'Quanto tempo lhe podes dedicar por semana? Sê realista, assim marco-te um ritmo que consigas cumprir.',
        'O que costuma travar-te quando aprendes algo novo? Isto ajuda-me a acompanhar-te melhor.',
        'E para terminar: como preferes que o teu tutor fale contigo?'
      ],
      'onb.chips': [null, null, null, ['A começar', 'Com experiência', 'À vontade'], ['Com exemplos reais', 'A praticar', 'A ver vídeos', 'Teoria primeiro'], ['Menos de 1 hora', '2-3 horas', '5 horas ou mais'], ['Falta de tempo', 'Disperso-me', 'Não vejo para quê', 'Tenho vergonha de praticar'], ['Direto ao assunto', 'Com tato e calma', 'A desafiar-me']],
      'onb.reading': 'Dá-me um segundo, estou a ler o vosso site…', 'onb.understood': 'Isto é o que percebi da vossa empresa:',
      'onb.cantRead': 'Não consegui ler esse site, mas não faz mal, continuamos.', 'onb.company': 'A tua empresa',
      'onb.done': 'Pronto, já te conheço um pouco. Agora vamos descobrir o teu ADN de aprendizagem: umas perguntas rápidas e terás o teu arquétipo e o teu certificado. No fim abre-se a tua rota.',
      'onb.dna': 'Descobrir o meu ADN', 'onb.ph': 'Escreve ou dita a tua resposta…', 'onb.send': 'Enviar', 'onb.answer': 'Resposta', 'onb.guide': 'O teu guia', 'onb.loading': 'A carregar…',
      'onb.vTitle': 'Bem-vindo ao SkillUp', 'onb.vStart': 'Começar', 'onb.vSkip': 'Saltar o vídeo',
      'onb.vText': 'Antes de começares, vê-o um momento: como vais aprender com casos da tua função, como demonstras que o aplicas, os desafios que o teu responsável te vai propor, o acompanhamento e o apoio que vais ter, e porque é que esta formação fica mesmo contigo. (Vídeo em espanhol.)',

      'vid.lang': 'Idioma dos vídeos',
      'vid.title': 'Vídeos', 'vid.back': '← Voltar', 'vid.hero': 'Aprende a ver',
      'vid.heroSub': 'Seleção real do YouTube sobre o que estás a estudar, nada inventado: todos com as suas visualizações e avaliações reais.',
      'vid.heroTopic': 'Seleção real do YouTube sobre este tema, nada inventado.',
      'vid.all': 'Tudo', 'vid.recent': 'Recentes', 'vid.mostViewed': 'Mais vistos', 'vid.topRated': 'Mais bem avaliados',
      'vid.newOn': 'Novidades sobre {t}', 'vid.justOut': 'acabados de publicar', 'vid.newT': 'Novidades', 'vid.newSub': 'acabados de publicar no YouTube',
      'vid.forYou': 'Para ti', 'vid.forYouSub': 'segundo a tua rota de aprendizagem', 'vid.favsSub': 'o mais visto pela tua equipa dentro do SkillUp',
      'vid.ratedSub': 'nota de qualidade: gostos e comentários por visualização, alcance e canal',
      'vid.views': 'visualizações', 'vid.likes': 'gostos', 'vid.inSkillup': 'no SkillUp', 'vid.like': 'Gosto', 'vid.dislike': 'Não gosto', 'vid.hide': 'Não mostrar mais', 'vid.similar': 'Semelhantes',
      'vid.empty': 'Ainda não há vídeos neste idioma para mostrar aqui. Experimenta outro idioma ou volta mais tarde.', 'vid.emptyIn': 'Ainda não há vídeos em {x}.',
      'vid.searching': 'A procurar vídeos…', 'vid.err': 'Não foi possível carregar os vídeos neste momento.', 'vid.loadErr': 'Não foi possível carregar. Volta a entrar.',
      'cv.title': 'Vídeos do curso', 'cv.sub': 'Seleção real do YouTube · {c}', 'cv.all': 'Ver todos', 'cv.close': 'Fechar os vídeos', 'cv.views': 'visualizações',
      'cv.block': 'Este bloco', 'cv.empty': 'Ainda não há vídeos para este curso neste idioma. Experimenta outro idioma.', 'cv.err': 'Não foi possível carregar os vídeos neste momento.', 'cv.retry': 'Tentar novamente',
      'cv.btn': 'Vídeos',
      'tx.auto': 'Traduzido automaticamente', 'tx.seeOrig': 'ver o original', 'tx.orig': 'Original em espanhol', 'tx.seeTr': 'ver a tradução', 'tx.working': 'A traduzir esta secção…', 'tx.fail': 'Não foi possível traduzir esta secção; é mostrado o original em espanhol.'
    },

    fr: {
      "cr.title": "Crédits de création",
      "cr.credits": "{n} crédits",
      "cr.perMin": " / min",
      "cr.soon": "Bientôt",
      "cr.locked": "En atteignant le niveau Coach (N4) dans une compétence, tu débloques la création par IA pour ton entreprise. Voici ce que tu pourras créer :",
      "cr.balance": "Solde de ton entreprise. Voici ce que tu peux créer :",
      "cr.topic": "Sujet du cours, p. ex. « Négocier avec les fournisseurs »",
      "cr.create": "Créer un cours avec l’IA",
      "cr.buy": "Acheter des crédits",
      "cr.needTopic": "Écris le sujet du cours.",
      "cr.working": "Le panel d'experts rédige et révise le cours…",
      "cr.gate": "Créer ce cours coûte {c} crédits. Il reste {b} à ton entreprise.",
      "cr.confirm": "Confirmer",
      "cr.spent": "{s} crédits dépensés · il en reste {b}.",
      "cr.draft": "Voir le brouillon",
      "cr.item.voz_narrada": "Voix narrée",
      "cr.item.avatar_estandar": "Vidéo avec avatar standard (HeyGen Avatar IV)",
      "cr.item.avatar_realista": "Vidéo avec avatar réaliste (HeyGen Avatar V)",
      "cr.item.avatar_propio": "Créer ton propre avatar",
      "cr.item.clonar_voz": "Cloner ta voix",
      "cr.item.curso_ia": "Créer un cours avec l’IA (panel d'experts)",

      'nav.dashboard': 'Mon tableau de bord', 'nav.courses': 'Formations', 'nav.explore': 'Explorer', 'nav.videos': 'Vidéos', 'nav.roleplays': 'Jeux de rôle',
      'nav.ranking': 'Classement', 'nav.certs': 'Certificats', 'nav.teamdna': 'Team DNA', 'nav.help': 'Aide', 'nav.privacy': 'Tes données',
      'nav.assign': 'Attribuer des épreuves', 'nav.validate': 'Valider des cas', 'nav.metrics': 'Indicateurs et insights', 'nav.live': 'En direct',
      'nav.company': "Tableau de bord de l'entreprise", 'nav.chatuse': 'Utilisation du chat', 'nav.pyramids': 'Pyramides', 'nav.roi': 'Rapport de ROI',
      'nav.feedback': 'Feedback', 'nav.console': 'Console', 'nav.suggest': 'Envoyer une suggestion', 'nav.suggestB': 'Envoyer une suggestion à Brandooers',
      'nav.exit': 'Se déconnecter', 'nav.open': 'Ouvrir le menu', 'nav.close': 'Fermer', 'nav.nav': 'Navigation', 'nav.lang': 'Langue',
      'nav.langSaved': 'Langue enregistrée', 'nav.langErr': "Impossible d'enregistrer la langue",

      'eyes.fab': "Ouvrir l'assistant Brandooers", 'eyes.fabTitle': "Touche pour ouvrir l'assistant · maintiens appuyé pour lui parler directement",
      'eyes.title': 'Assistant', 'eyes.voice': 'Voix', 'eyes.read': 'Lire les réponses à voix haute', 'eyes.home': 'Menu principal', 'eyes.homeAria': 'Aller au menu principal',
      'eyes.close': 'Fermer', 'eyes.dictate': 'Dicter', 'eyes.talk': 'Parler', 'eyes.placeholder': 'Écris ou parle…', 'eyes.msg': 'Message', 'eyes.send': 'Envoyer',
      'eyes.tutors': 'Tes tuteurs', 'eyes.tutorOf': 'Tuteur {x}', 'eyes.openCourse': 'Ouvrir le cours de {x}',
      'eyes.spec.Comercial': 'Vente', 'eyes.spec.Marketing': 'Marketing', 'eyes.spec.Negociación': 'Négociation', 'eyes.spec.Acompañamiento': 'Accompagnement',
      'eyes.micPerm': "J'ai besoin de l'autorisation d'utiliser le micro. Active-la dans les réglages du navigateur, ou écris-moi ici.",
      'eyes.micNone': 'Je ne trouve pas de micro sur cet appareil. Tu peux m’écrire ici.',
      'eyes.micNA': "La dictée vocale n'est pas disponible dans ce navigateur pour le moment. Écris-moi et je te réponds.",
      'eyes.hello': 'Salut', 'eyes.fallback': 'Salut{name}. Je suis ton guide chez Brandooers. Dis-moi ton objectif ou demande-moi par où commencer.',
      'eyes.down': "Je ne peux pas répondre pour l'instant (le service d'IA est indisponible). Réessaie dans un moment.",
      'eyes.noVoice': 'Ce navigateur ne permet pas de me parler à voix haute. Touche les yeux et écris-moi.',
      'eyes.listening': "Je t'écoute…", 'eyes.micPerm2': "J'ai besoin de l'autorisation d'utiliser le micro. Active-la dans les réglages du navigateur.",
      'eyes.notHeard': "Je ne t'ai pas entendu. Garde les yeux appuyés pendant que tu parles.", 'eyes.cantAnswer': "Je ne peux pas répondre pour l'instant. Réessaie dans un moment.",
      'eyes.mute': 'Couper la voix des agents', 'eyes.unmute': 'Activer la voix des agents', 'eyes.voiceOff': 'Couper la voix', 'eyes.voiceOn': 'Me parler à voix haute',
      'eyes.g.inicio': "Ici, tu vois ta progression et tes cours. Touche une carte pour reprendre là où tu t'étais arrêté.",
      'eyes.g.ruta': 'Voici ta carte des connaissances. Survole les bulles et clique pour entrer dans un thème.',
      'eyes.g.explorar': "Demande-moi ce que tu veux, ou cherche un cours. Je te laisse des ressources ici, à côté de la réponse.",
      'eyes.g.workforce': "Ici, tu vois comment toute l'équipe apprend, regroupée selon la façon dont chacun contribue.",

      'dict.listening': "Je t'écoute · touche pour terminer", 'dict.convo': 'Conversation active · touche pour terminer', 'dict.talk': 'Parler',

      'fb.useful': 'Réponse utile', 'fb.improvable': 'Réponse à améliorer', 'fb.thanks': 'Merci', 'fb.saveErr': "Impossible d'enregistrer",
      'fb.what': "Qu'est-ce qui n'allait pas ? Ça nous aide à nous améliorer.", 'fb.reason': 'Motif', 'fb.comment': 'Commentaire (facultatif)', 'fb.send': 'Envoyer', 'fb.cancel': 'Annuler',
      'fb.r.dato_incorrecto': 'Information inexacte', 'fb.r.fuera_de_tema': 'Hors sujet', 'fb.r.no_lo_entiendo': 'Je ne comprends pas',
      'fb.r.voz': 'La voix sonne mal ou ne marche pas', 'fb.r.palabra_mal_escrita': 'Mot mal orthographié', 'fb.r.otro': 'Autre',
      'fb.t.sugerencia': 'Suggestion', 'fb.t.error': 'Bug', 'fb.t.contenido': 'Demande de contenu', 'fb.t.otro': 'Autre',
      'fb.s.nuevo': 'Reçu', 'fb.s.en_revision': 'En cours d’examen', 'fb.s.resuelto': 'Résolu', 'fb.s.descartado': 'Écarté',
      'fb.titleAdmin': 'Envoyer une suggestion à Brandooers', 'fb.title': 'Envoyer une suggestion',
      'fb.subAdmin': "Dis-nous ce que tu améliorerais dans la plateforme pour ton entreprise. L'équipe Brandooers lit tout.",
      'fb.sub': 'Une idée, un bug ou un contenu qui te manque. On lit tout.',
      'fb.type': 'Type', 'fb.yourMsg': 'Ton message', 'fb.ph': 'Écris ici…',
      'fb.ctx': 'La page, ton rôle, ton entreprise et ton navigateur sont joints automatiquement. Rien de plus.',
      'fb.close': 'Fermer', 'fb.mine': 'Ce que tu as déjà envoyé', 'fb.more': 'Écris un peu plus', 'fb.sendErr': "Impossible d'envoyer",
      'fb.ok': "Merci. C'est bien reçu et on te préviendra quand ce sera résolu.", 'fb.rated': 'Réponse évaluée',
      'fb.yourSug': 'Ta suggestion', 'fb.yourRating': 'Ton évaluation', 'fb.resolved': 'a été résolue :',

      'act.noticeT': 'Ta formation, avec un accompagnement',
      'act.notice1': "Pour pouvoir t'aider, ton coach, ton responsable et l'administration de ton entreprise peuvent voir ton activité dans SkillUp : le cours et la section que tu consultes, le temps actif, tes résultats aux tests et aux jeux de rôle et ta conversation avec le tuteur. Ils peuvent aussi t'écrire dans le chat.",
      'act.notice2': "Ton écran, ta frappe au clavier et ta caméra ne sont jamais enregistrés. Si quelqu'un suit ta session en direct, tu verras son nom en haut. Ces données sont conservées 90 jours au maximum.",
      'act.ok': "J'ai compris", 'act.your': 'Ton {role} {name}', 'act.watching1': '{who} suit ta session', 'act.watchingN': '{who} et {last} suivent ta session',
      'act.and': 'et', 'act.whatSee': "Ce qu'il voit", 'act.manager': 'Ton responsable', 'act.managerRole': 'Responsable', 'act.reply': 'Répondre dans le chat',

      'priv.title': 'Tes données', 'priv.lead': 'Ce que SkillUp conserve sur toi, à quoi ça sert et qui le voit. Sans petits caractères.',
      'priv.kept': 'Ce qui est conservé',
      'priv.k1': "Tes conversations avec les tuteurs et ce que tu leur racontes (entretiens, notes, réponses aux tests et aux jeux de rôle), dans le compte de ton entreprise.",
      'priv.k2': 'Ta progression : cours, blocs, notes, certificats et points.',
      'priv.k3': "Ton activité d'utilisation (page et section où tu te trouves, temps actif) : elle s'efface automatiquement au bout de 90 jours.",
      'priv.k4': 'Tes évaluations et suggestions.',
      'priv.use': 'À quoi ça sert',
      'priv.u1': "Pour que tes tuteurs te connaissent et t'aident mieux, et pour que toute l'équipe apprenne de cas réels.",
      'priv.u2': "Pour les indicateurs d'apprentissage de ton entreprise.",
      'priv.u3': 'Les corrections de termes que tu fais sont apprises pour toute ton entreprise.',
      'priv.u4': "L'utilisation du chat est contrôlée (limite quotidienne et mots interdits) pour éviter les abus et les dépenses inutiles.",
      'priv.u5': "Les textes sont traités par des fournisseurs d'intelligence artificielle pour générer les réponses.",
      'priv.who': 'Qui le voit',
      'priv.w1': 'Tes collègues ne voient pas tes conversations.',
      'priv.w2': "Tes responsables (coach, team leader, admin de ton entreprise) peuvent voir ta progression et lire tes conversations avec les tuteurs pour t'accompagner. Tu verras toujours un avis avec le nom de la personne qui suit ta session.",
      'priv.w3': 'Ton écran, ta frappe au clavier et ta caméra ne sont jamais enregistrés.',
      'priv.rights': 'Tes droits',
      'priv.rightsTx': "Tu peux télécharger dès maintenant une copie de tes données. Pour les corriger ou les supprimer, demande-le à ton entreprise, qui est responsable de tes données ; Brandooers les traite pour son compte.",
      'priv.download': 'TÉLÉCHARGER MES DONNÉES', 'priv.preparing': 'PRÉPARATION…', 'priv.done': 'TÉLÉCHARGÉ', 'priv.err': 'ÉCHEC : RÉESSAIE', 'priv.back': "Tableau de bord de l'entreprise",

      'loader.wait': 'Un instant…', 'loader.chasing': '{who} te poursuit', 'loader.record': 'Record {n}', 'loader.recordLow': 'record',
      'loader.today': 'Jeu du jour : {name} · {hint}', 'loader.next': 'À ta prochaine attente :', 'loader.gameAria': 'Mini-jeu pendant que tu attends : {name}. {hint}',
      'loader.caught': '{who} t’a rattrapé !', 'loader.points': '{msg} {n} points · touche pour rejouer', 'loader.distract': 'Trop de distractions.',
      'loader.crash': "Conflit d'agenda !", 'loader.ate': 'Tu as percuté {who} !', 'loader.escaped3': 'Trois objections se sont échappées.',
      'loader.lives': 'Vies', 'loader.escapes': 'Échappées', 'loader.mon': 'LUN', 'loader.pricey': "C'est trop cher",
      'loader.lines': ['On affûte les questions…', 'On lit ce que tu as raconté, sans fouiner…', 'On écarte les questions trop faciles…', "On réveille le neurone de l'examinateur…", 'On cherche le cas qui te fera le plus réfléchir…', 'On retire les pièges… presque tous…', "On range les idées pour que l'effort soit juste…", 'On demande au tuteur de ne pas en faire trop…', "C'est presque prêt : dernières retouches…"],
      'loader.themes': [{ who: 'le lundi', obs: ['Réunion', 'Encore une réunion', 'Café froid'] }, { who: 'la boîte de réception', obs: ['RE: RE:', 'Urgent', 'Spam'] }, { who: "l'objection", obs: ["Pas le temps", "J'ai déjà un fournisseur", "Envoie-moi une doc"] }, { who: "l'Excel sans fin", obs: ['#REF!', 'Cellule fusionnée', 'Macro'] }, { who: 'le KPI du trimestre', obs: ['Forecast', 'Churn', 'T4'] }, { who: 'la notification', obs: ['Ping', 'T’as 5 min ?', 'Rappel'] }],
      'loader.games': [{ name: 'Cours, les yeux', hint: 'Touche pour sauter' }, { name: 'Attrape les idées', hint: "Touche d'un côté ou de l'autre pour bouger" }, { name: 'Vole, les yeux', hint: 'Touche pour voler' }, { name: 'Chasse aux objections', hint: "Touche les objections avant qu'elles ne s'échappent" }],
      'lp.Generando tu test…': 'Création de ton test…', 'lp.Se prepara solo para ti.': 'Il est préparé rien que pour toi.',
      'lp.Preparando tus preguntas…': 'Préparation de tes questions…', 'lp.Unos segundos…': 'Quelques secondes…',
      'lp.Preparando tu examen final…': 'Préparation de ton examen final…', 'lp.Puede tardar hasta un minuto: se generan preguntas nuevas solo para ti.': "Ça peut prendre jusqu'à une minute : de nouvelles questions sont générées rien que pour toi.",
      'lp.Unos segundos: se generan con lo que has visto y lo que has contado.': "Quelques secondes : elles sont générées à partir de ce que tu as vu et de ce que tu as raconté.",
      'lp.Se acabó el tiempo. Corrigiendo…': 'Temps écoulé. Correction…', 'lp.Corrigiendo…': 'Correction…', 'lp.Las respuestas abiertas se corrigen con su rúbrica.': 'Les réponses ouvertes sont corrigées selon leur grille.',
      'lp.Preparando el caso y el personaje…': 'Préparation du cas et du personnage…', 'lp.Preparando unas preguntas sobre tu situación…': 'Préparation de quelques questions sur ta situation…',
      'lp.Mientras preparo el caso, juega un poco.': 'Pendant que je prépare le cas, joue un peu.',

      'onb.langQ': "Avant de commencer : dans quelle langue veux-tu utiliser SkillUp ? Tout s'adaptera : les tuteurs, les tests, la voix et les vidéos. Tu pourras la changer à tout moment depuis le menu.",
      'onb.steps': [
        "Salut. Faisons connaissance en une minute pour que tout ça s'adapte à toi. Que fais-tu ? Décris-moi ton poste en détail : ce que tu fais, avec qui et ce que tu décides.",
        "Super. Quel est le site web de ton entreprise ? J'y jette un œil pour vous connaître et adapter les exemples à votre activité.",
        "Qu'aimerais-tu obtenir grâce à ça ? Ton objectif, même en une phrase.",
        'À quel niveau te situes-tu en ce moment ?',
        'Comment apprends-tu le mieux ?',
        'Combien de temps peux-tu y consacrer par semaine ? Sois réaliste, comme ça je te fixe un rythme que tu peux tenir.',
        "Qu'est-ce qui te freine d'habitude quand tu apprends quelque chose de nouveau ? Ça m'aide à mieux t'accompagner.",
        "Et pour finir : comment préfères-tu que ton tuteur te parle ?"
      ],
      'onb.chips': [null, null, null, ['Je débute', "J'ai de l'expérience", "Je suis à l'aise"], ['Avec des exemples réels', 'En pratiquant', 'En regardant des vidéos', "La théorie d'abord"], ["Moins d'1 heure", '2-3 heures', '5 heures ou plus'], ['Le manque de temps', 'Je me disperse', "Je n'en vois pas l'intérêt", "J'ai du mal à me lancer"], ['Direct et droit au but', 'Avec tact et calme', 'En me mettant au défi']],
      'onb.reading': 'Une seconde, je lis votre site…', 'onb.understood': "Voici ce que j'ai compris de votre entreprise :",
      'onb.cantRead': "Je n'ai pas pu lire ce site, mais ce n'est pas grave, on continue.", 'onb.company': 'Ton entreprise',
      'onb.done': "C'est bon, je te connais un peu mieux. Découvrons maintenant ton ADN d'apprentissage : quelques questions rapides et tu auras ton archétype et ton certificat. À la fin, ton parcours s'ouvre.",
      'onb.dna': 'Découvrir mon ADN', 'onb.ph': 'Écris ou dicte ta réponse…', 'onb.send': 'Envoyer', 'onb.answer': 'Réponse', 'onb.guide': 'Ton guide', 'onb.loading': 'Chargement…',
      'onb.vTitle': 'Bienvenue sur SkillUp', 'onb.vStart': 'Commencer', 'onb.vSkip': 'Passer la vidéo',
      'onb.vText': "Avant de commencer, regarde-la un instant : comment tu vas apprendre avec des cas de ton poste, comment tu montres que tu l'appliques, les défis que ton responsable te proposera, le suivi et le soutien dont tu bénéficieras, et pourquoi cette formation, elle, te restera. (Vidéo en espagnol.)",

      'vid.lang': 'Langue des vidéos',
      'vid.title': 'Vidéos', 'vid.back': '← Retour', 'vid.hero': 'Apprends en regardant',
      'vid.heroSub': 'Une vraie sélection YouTube sur ce que tu étudies, rien d’inventé : chaque vidéo avec ses vraies vues et ses vrais « j’aime ».',
      'vid.heroTopic': 'Une vraie sélection YouTube sur ce thème, rien d’inventé.',
      'vid.all': 'Tout', 'vid.recent': 'Récentes', 'vid.mostViewed': 'Les plus vues', 'vid.topRated': 'Les mieux notées',
      'vid.newOn': 'Nouveautés sur {t}', 'vid.justOut': 'tout juste publiées', 'vid.newT': 'Nouveautés', 'vid.newSub': 'tout juste publiées sur YouTube',
      'vid.forYou': 'Pour toi', 'vid.forYouSub': "selon ton parcours d'apprentissage", 'vid.favsSub': 'ce que ton équipe regarde le plus dans SkillUp',
      'vid.ratedSub': 'note de qualité : « j’aime » et commentaires par vue, audience et chaîne',
      'vid.views': 'vues', 'vid.likes': 'j’aime', 'vid.inSkillup': 'dans SkillUp', 'vid.like': "J'aime", 'vid.dislike': "Je n'aime pas", 'vid.hide': 'Ne plus afficher', 'vid.similar': 'Similaires',
      'vid.empty': "Pas encore de vidéos dans cette langue ici. Essaie une autre langue ou reviens plus tard.", 'vid.emptyIn': 'Pas encore de vidéos dans {x}.',
      'vid.searching': 'Recherche de vidéos…', 'vid.err': "Impossible de charger les vidéos pour l'instant.", 'vid.loadErr': 'Impossible de charger. Reconnecte-toi.',
      'cv.title': 'Vidéos du cours', 'cv.sub': 'Vraie sélection YouTube · {c}', 'cv.all': 'Tout voir', 'cv.close': 'Fermer les vidéos', 'cv.views': 'vues',
      'cv.block': 'Cette section', 'cv.empty': "Pas encore de vidéos pour ce cours dans cette langue. Essaie une autre langue.", 'cv.err': "Impossible de charger les vidéos pour l'instant.", 'cv.retry': 'Réessayer',
      'cv.btn': 'Vidéos',
      'tx.auto': 'Traduit automatiquement', 'tx.seeOrig': "voir l'original", 'tx.orig': 'Original en espagnol', 'tx.seeTr': 'voir la traduction', 'tx.working': 'Traduction de cette section…', 'tx.fail': "Cette section n'a pas pu être traduite ; l'original en espagnol est affiché."
    }
  };

  function norm(l) { l = String(l || '').toLowerCase().slice(0, 2); return LANGS[l] ? l : null; }
  function browserLang() { var n = (navigator.languages && navigator.languages[0]) || navigator.language || ''; return norm(n) || 'es'; }
  var lang = 'es';
  try { lang = norm(localStorage.getItem('su-lang')) || 'es'; } catch (e) { }

  function fill(s, vars) { return !vars ? s : String(s).replace(/\{(\w+)\}/g, function (m, k) { return vars[k] != null ? vars[k] : m; }); }
  function t(key, es, vars) {
    var v = lang !== 'es' && D[lang] && D[lang][key];
    return fill(v != null && v !== false ? v : es, vars);
  }

  // data-i18n (texto) y data-i18n-attr ("attr:clave;attr:clave"). El original en español queda en el propio nodo.
  function applyEl(el) {
    var k = el.getAttribute('data-i18n');
    if (k) { if (el.__i18nEs == null) el.__i18nEs = el.textContent; el.textContent = t(k, el.__i18nEs); }
    var a = el.getAttribute('data-i18n-attr');
    if (a) {
      el.__i18nAttr = el.__i18nAttr || {};
      a.split(';').forEach(function (pair) {
        var p = pair.split(':'); if (p.length < 2) return; var at = p[0].trim(), key = p[1].trim();
        if (!(at in el.__i18nAttr)) el.__i18nAttr[at] = el.getAttribute(at) || '';
        el.setAttribute(at, t(key, el.__i18nAttr[at]));
      });
    }
  }
  function apply(root) {
    root = root || document;
    if (root.nodeType === 1 && (root.hasAttribute('data-i18n') || root.hasAttribute('data-i18n-attr'))) applyEl(root);
    if (root.querySelectorAll) [].forEach.call(root.querySelectorAll('[data-i18n],[data-i18n-attr]'), applyEl);
  }
  function setHtmlLang() { try { document.documentElement.lang = lang; } catch (e) { } }

  var listeners = [];
  function use(l, silent) {
    l = norm(l) || 'es'; var changed = l !== lang; lang = l;
    try { localStorage.setItem('su-lang', l); } catch (e) { }
    setHtmlLang(); apply(document);
    if (changed && !silent) { listeners.forEach(function (fn) { try { fn(l); } catch (e) { } }); try { document.dispatchEvent(new CustomEvent('su-lang', { detail: { lang: l } })); } catch (e) { } }
    return changed;
  }
  /** Guarda la preferencia en la cuenta y la aplica ya. */
  function set(l) {
    l = norm(l) || 'es';
    return fetch('/api/org/me/lang', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lang: l }) })
      .then(function (r) { if (!r.ok) throw new Error('lang ' + r.status); use(l); return l; });
  }

  setHtmlLang();
  // Traduce lo que se vaya añadiendo (menú, ojos, formularios…) sin que cada módulo tenga que llamar a apply().
  function observe() {
    apply(document);
    try {
      new MutationObserver(function (muts) {
        if (lang === 'es') return;
        muts.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) apply(n); }); });
      }).observe(document.documentElement, { childList: true, subtree: true });
    } catch (e) { }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', observe); else observe();

  // La cuenta manda: si la preferencia guardada difiere de la de este navegador, se aplica la de la cuenta.
  var ready = (/\/app\/(login|reset|aceptar-invitacion)\.html/.test(location.pathname) ? Promise.resolve(null)
    : fetch('/api/org/me', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }))
    .then(function (me) { if (me && me.lang) use(me.lang); return me; });

  window.SUI18n = {
    LANGS: LANGS, get lang() { return lang; }, t: t, apply: apply, use: use, set: set, ready: ready,
    speech: function (l) { return SPEECH[norm(l) || lang] || 'es-ES'; }, videoNote: function (l) { return NOTE[norm(l) || lang]; },
    browserLang: browserLang, onChange: function (fn) { listeners.push(fn); }, _dict: D
  };
})();
