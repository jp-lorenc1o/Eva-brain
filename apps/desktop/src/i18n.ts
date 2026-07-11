export const APP_LANGUAGE_PREFERENCE_KEY = 'eva:app-language';

export const locales = [
  'en',
  'es',
  'pt',
  'fr',
  'de',
  'it',
  'ja',
  'ko',
  'zh-Hans',
  'zh-Hant',
] as const;

export type Locale = (typeof locales)[number];
export type AppLanguage = Locale | 'system';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  es: 'Español',
  pt: 'Português',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  ja: '日本語',
  ko: '한국어',
  'zh-Hans': '中文（简体）',
  'zh-Hant': '中文（繁體）',
};

const english = {
  'home.kicker': 'LLM Brain',
  'home.title': 'Begin with a brain',
  'home.copy': 'Eva turns curated sources into a maintained, interlinked body of knowledge. Start a new brain or open one you already keep on disk.',
  'home.create.title': 'Create a new brain',
  'home.create.detail': 'Set its language, purpose, and AI setup.',
  'home.open.title': 'Open an existing brain',
  'home.open.detail': 'Read a local folder of Markdown pages as a graph.',
  'home.manage': 'Manage your local brains',
  'home.settings': 'App settings',
  'recent.label': 'Recent',
  'nav.home': 'Home',
  'nav.new': 'New brain',
  'nav.open': 'Open brain',
  'nav.manage': 'Manage brains',
  'nav.settings': 'Settings',
  'nav.noBrain': 'No brain open',
  'op.ingest': 'Ingest',
  'op.query': 'Query',
  'op.health': 'Health',
  'op.log': 'Log',
  'op.reorganize': 'Reorganize',
  'type.index': 'Index',
  'type.entity': 'Entity',
  'type.concept': 'Concept',
  'type.summary': 'Summary',
  'type.analysis': 'Analysis',
  'type.person': 'Person',
  'type.project': 'Project',
  'type.note': 'Note',
  'type.log': 'Log',
  'type.untyped': 'Untyped',
  'health.title': 'Health',
  'log.title': 'Log',
  'review.title': 'Review changes',
  'review.accept': 'Accept and merge',
  'review.reject': 'Reject',
  'query.kicker': 'Ask the record',
  'query.title': 'Query brain',
  'query.copy': 'Eva reads the current brain and returns a cited answer. Asking never changes it; saving creates a reviewable analysis page.',
  'query.question': 'Question',
  'query.placeholder': 'What does the evidence suggest about…',
  'query.ask': 'Ask brain',
  'query.processing': 'Processing',
  'query.searching': 'Eva is searching the brain and tracing sources…',
  'query.answer': 'Answer',
  'query.save': 'Save as analysis',
  'query.evidence': 'Evidence',
  'library.kicker': 'Your library',
  'library.title': 'Your brains',
  'library.copy': 'Choose a brain Eva already keeps in Documents/Eva/Brains, or import one from elsewhere.',
  'library.manage': 'Manage brains',
  'library.import': 'Import a brain',
  'library.new': 'New brain',
  'manager.kicker': 'Local library',
  'manager.title': 'Brain manager',
  'manager.copy': 'See where each brain lives and set the profile Eva uses when it works there.',
  'manager.shelf': 'Your brains',
  'manager.language': 'Working language',
  'manager.runtime': 'AI runtime',
  'manager.codex': 'Use the Codex CLI signed in on this Mac.',
  'manager.claude': 'Use the Claude CLI signed in on this Mac.',
  'manager.purpose': 'What is this brain for?',
  'common.optional': 'Optional',
  'manager.save': 'Save changes',
  'new.kicker': 'First page',
  'new.title': 'New brain',
  'new.copy': 'Set the frame for this knowledge project. Eva stores these choices in the local brain schema that your AI reads before it works.',
  'new.name': 'Brain name',
  'new.namePlaceholder': 'Research atlas',
  'new.language': 'Working language',
  'new.runtime': 'AI runtime',
  'new.codex': 'Use the Codex CLI already signed in on this Mac.',
  'new.claude': 'Use the Claude CLI already signed in on this Mac.',
  'new.credentials': 'Eva stores no credentials. The selected runtime is saved with this local brain.',
  'new.purpose': 'What is this brain for?',
  'new.purposePlaceholder': 'Track a research topic, plan a trip, understand a company…',
  'new.directory': 'Your brains',
  'new.directoryCopy': 'Eva creates and keeps them in Documents/Eva/Brains.',
  'new.cancel': 'Cancel',
  'new.create': 'Create brain',
  'settings.kicker': 'Eva',
  'settings.title': 'App settings',
  'settings.copy': 'Choose the language Eva uses for its interface. This does not change a brain’s working language.',
  'settings.language': 'App language',
  'settings.system': 'Use system language',
  'settings.hint': 'Saved only on this device.',
  'aria.home': 'Return to Eva’s opening page',
  'aria.close': 'Close',
} as const;

export type TranslationKey = keyof typeof english;
type Dictionary = Partial<Record<TranslationKey, string>>;

const dictionaries: Record<Locale, Dictionary> = {
  en: english,
  es: {
    'home.kicker': 'Cerebro LLM', 'home.title': 'Empieza con un cerebro', 'home.copy': 'Eva convierte fuentes seleccionadas en un cuerpo de conocimiento mantenido e interconectado. Crea un cerebro o abre uno que ya guardas en tu disco.',
    'home.create.title': 'Crear un cerebro', 'home.create.detail': 'Define su idioma, propósito y configuración de IA.', 'home.open.title': 'Abrir un cerebro existente', 'home.open.detail': 'Lee una carpeta local de Markdown como un grafo.', 'home.manage': 'Gestionar mis cerebros locales', 'home.settings': 'Ajustes de la aplicación', 'recent.label': 'Recientes',
    'nav.home': 'Inicio', 'nav.new': 'Nuevo cerebro', 'nav.open': 'Abrir cerebro', 'nav.manage': 'Gestionar cerebros', 'nav.settings': 'Ajustes', 'nav.noBrain': 'Ningún cerebro abierto',
    'op.ingest': 'Ingerir', 'op.query': 'Consultar', 'op.health': 'Estado', 'op.log': 'Registro', 'op.reorganize': 'Reorganizar', 'type.index': 'Índice', 'type.entity': 'Entidad', 'type.concept': 'Concepto', 'type.summary': 'Resumen', 'type.analysis': 'Análisis', 'type.person': 'Persona', 'type.project': 'Proyecto', 'type.note': 'Nota', 'type.log': 'Registro', 'type.untyped': 'Sin clasificar', 'health.title': 'Estado', 'log.title': 'Registro', 'review.title': 'Revisar cambios', 'review.accept': 'Aceptar y fusionar', 'review.reject': 'Rechazar',
    'query.kicker': 'Consultar el archivo', 'query.title': 'Consultar cerebro', 'query.copy': 'Eva lee el cerebro actual y devuelve una respuesta con citas. Consultar no lo modifica; guardar crea una página de análisis revisable.', 'query.question': 'Pregunta', 'query.placeholder': '¿Qué sugiere la evidencia sobre…?', 'query.ask': 'Consultar cerebro', 'query.processing': 'Procesando', 'query.searching': 'Eva está buscando en el cerebro y rastreando las fuentes…', 'query.answer': 'Respuesta', 'query.save': 'Guardar como análisis', 'query.evidence': 'Evidencia',
    'library.kicker': 'Tu biblioteca', 'library.title': 'Tus cerebros', 'library.copy': 'Elige un cerebro que Eva ya guarda en Documents/Eva/Brains o importa uno desde otro lugar.', 'library.manage': 'Gestionar cerebros', 'library.import': 'Importar cerebro', 'library.new': 'Nuevo cerebro',
    'manager.kicker': 'Biblioteca local', 'manager.title': 'Gestor de cerebros', 'manager.copy': 'Consulta dónde vive cada cerebro y define el perfil que Eva usa al trabajar en él.', 'manager.shelf': 'Tus cerebros', 'manager.language': 'Idioma de trabajo', 'manager.runtime': 'IA', 'manager.codex': 'Usa la CLI de Codex iniciada en este Mac.', 'manager.claude': 'Usa la CLI de Claude iniciada en este Mac.', 'manager.purpose': '¿Para qué sirve este cerebro?', 'common.optional': 'Opcional', 'manager.save': 'Guardar cambios',
    'new.kicker': 'Primera página', 'new.title': 'Nuevo cerebro', 'new.copy': 'Define el marco de este proyecto de conocimiento. Eva guarda estas decisiones en el esquema local que tu IA lee antes de trabajar.', 'new.name': 'Nombre del cerebro', 'new.namePlaceholder': 'Atlas de investigación', 'new.language': 'Idioma de trabajo', 'new.runtime': 'IA', 'new.codex': 'Usa la CLI de Codex iniciada en este Mac.', 'new.claude': 'Usa la CLI de Claude iniciada en este Mac.', 'new.credentials': 'Eva no guarda credenciales. La IA elegida se guarda en este cerebro local.', 'new.purpose': '¿Para qué sirve este cerebro?', 'new.purposePlaceholder': 'Seguir un tema de investigación, planear un viaje, entender una empresa…', 'new.directory': 'Tus cerebros', 'new.directoryCopy': 'Eva los crea y guarda en Documents/Eva/Brains.', 'new.cancel': 'Cancelar', 'new.create': 'Crear cerebro',
    'settings.kicker': 'Eva', 'settings.title': 'Ajustes de la aplicación', 'settings.copy': 'Elige el idioma que Eva usa en su interfaz. No cambia el idioma de trabajo de un cerebro.', 'settings.language': 'Idioma de la aplicación', 'settings.system': 'Usar el idioma del sistema', 'settings.hint': 'Se guarda solo en este dispositivo.', 'aria.home': 'Volver a la página de inicio de Eva', 'aria.close': 'Cerrar',
  },
  pt: {
    'home.kicker': 'Cérebro LLM', 'home.title': 'Comece com um cérebro', 'home.copy': 'Eva transforma fontes selecionadas em um conjunto de conhecimento mantido e interligado. Crie um cérebro ou abra um que já esteja no seu disco.',
    'home.create.title': 'Criar um cérebro', 'home.create.detail': 'Defina idioma, propósito e configuração de IA.', 'home.open.title': 'Abrir um cérebro existente', 'home.open.detail': 'Leia uma pasta local de Markdown como um grafo.', 'home.manage': 'Gerenciar meus cérebros locais', 'home.settings': 'Configurações do aplicativo', 'recent.label': 'Recentes',
    'nav.home': 'Início', 'nav.new': 'Novo cérebro', 'nav.open': 'Abrir cérebro', 'nav.manage': 'Gerenciar cérebros', 'nav.settings': 'Configurações', 'nav.noBrain': 'Nenhum cérebro aberto',
    'op.ingest': 'Ingerir', 'op.query': 'Consultar', 'op.health': 'Saúde', 'op.log': 'Registro', 'op.reorganize': 'Reorganizar', 'type.index': 'Índice', 'type.entity': 'Entidade', 'type.concept': 'Conceito', 'type.summary': 'Resumo', 'type.analysis': 'Análise', 'type.person': 'Pessoa', 'type.project': 'Projeto', 'type.note': 'Nota', 'type.log': 'Registro', 'type.untyped': 'Sem tipo', 'health.title': 'Saúde', 'log.title': 'Registro', 'review.title': 'Revisar alterações', 'review.accept': 'Aceitar e mesclar', 'review.reject': 'Rejeitar',
    'query.kicker': 'Consultar o acervo', 'query.title': 'Consultar cérebro', 'query.copy': 'Eva lê o cérebro atual e devolve uma resposta citada. Consultar não o altera; salvar cria uma página de análise revisável.', 'query.question': 'Pergunta', 'query.placeholder': 'O que as evidências sugerem sobre…?', 'query.ask': 'Consultar cérebro', 'query.processing': 'Processando', 'query.searching': 'Eva está pesquisando o cérebro e rastreando as fontes…', 'query.answer': 'Resposta', 'query.save': 'Salvar como análise', 'query.evidence': 'Evidências',
    'library.kicker': 'Sua biblioteca', 'library.title': 'Seus cérebros', 'library.copy': 'Escolha um cérebro que Eva já guarda em Documents/Eva/Brains ou importe outro de algum lugar.', 'library.manage': 'Gerenciar cérebros', 'library.import': 'Importar cérebro', 'library.new': 'Novo cérebro',
    'manager.kicker': 'Biblioteca local', 'manager.title': 'Gerenciador de cérebros', 'manager.copy': 'Veja onde cada cérebro fica e defina o perfil que Eva usa ao trabalhar nele.', 'manager.shelf': 'Seus cérebros', 'manager.language': 'Idioma de trabalho', 'manager.runtime': 'IA', 'manager.codex': 'Use a CLI do Codex conectada neste Mac.', 'manager.claude': 'Use a CLI do Claude conectada neste Mac.', 'manager.purpose': 'Para que serve este cérebro?', 'common.optional': 'Opcional', 'manager.save': 'Salvar alterações',
    'new.kicker': 'Primeira página', 'new.title': 'Novo cérebro', 'new.copy': 'Defina o contexto deste projeto de conhecimento. Eva salva essas escolhas no esquema local que sua IA lê antes de trabalhar.', 'new.name': 'Nome do cérebro', 'new.namePlaceholder': 'Atlas de pesquisa', 'new.language': 'Idioma de trabalho', 'new.runtime': 'IA', 'new.codex': 'Use a CLI do Codex conectada neste Mac.', 'new.claude': 'Use a CLI do Claude conectada neste Mac.', 'new.credentials': 'Eva não armazena credenciais. A IA escolhida é salva neste cérebro local.', 'new.purpose': 'Para que serve este cérebro?', 'new.purposePlaceholder': 'Acompanhar um tema, planejar uma viagem, entender uma empresa…', 'new.directory': 'Seus cérebros', 'new.directoryCopy': 'Eva os cria e guarda em Documents/Eva/Brains.', 'new.cancel': 'Cancelar', 'new.create': 'Criar cérebro',
    'settings.kicker': 'Eva', 'settings.title': 'Configurações do aplicativo', 'settings.copy': 'Escolha o idioma que Eva usa na interface. Isso não muda o idioma de trabalho de um cérebro.', 'settings.language': 'Idioma do aplicativo', 'settings.system': 'Usar idioma do sistema', 'settings.hint': 'Salvo somente neste dispositivo.', 'aria.home': 'Voltar à página inicial da Eva', 'aria.close': 'Fechar',
  },
  fr: {
    'home.kicker': 'Cerveau LLM', 'home.title': 'Commencez avec un cerveau', 'home.copy': 'Eva transforme des sources sélectionnées en un corpus de connaissances maintenu et interconnecté. Créez un cerveau ou ouvrez-en un déjà présent sur votre disque.',
    'home.create.title': 'Créer un cerveau', 'home.create.detail': 'Définissez sa langue, son but et sa configuration IA.', 'home.open.title': 'Ouvrir un cerveau existant', 'home.open.detail': 'Lisez un dossier Markdown local sous forme de graphe.', 'home.manage': 'Gérer mes cerveaux locaux', 'home.settings': 'Réglages de l’application', 'recent.label': 'Récents',
    'nav.home': 'Accueil', 'nav.new': 'Nouveau cerveau', 'nav.open': 'Ouvrir un cerveau', 'nav.manage': 'Gérer les cerveaux', 'nav.settings': 'Réglages', 'nav.noBrain': 'Aucun cerveau ouvert',
    'op.ingest': 'Intégrer', 'op.query': 'Interroger', 'op.health': 'Santé', 'op.log': 'Journal', 'op.reorganize': 'Réorganiser', 'type.index': 'Index', 'type.entity': 'Entité', 'type.concept': 'Concept', 'type.summary': 'Synthèse', 'type.analysis': 'Analyse', 'type.person': 'Personne', 'type.project': 'Projet', 'type.note': 'Note', 'type.log': 'Journal', 'type.untyped': 'Sans type', 'health.title': 'Santé', 'log.title': 'Journal', 'review.title': 'Examiner les changements', 'review.accept': 'Accepter et fusionner', 'review.reject': 'Rejeter',
    'query.kicker': 'Interroger le dossier', 'query.title': 'Interroger le cerveau', 'query.copy': 'Eva lit le cerveau actuel et renvoie une réponse sourcée. Une question ne le modifie pas ; l’enregistrement crée une page d’analyse révisable.', 'query.question': 'Question', 'query.placeholder': 'Que suggèrent les éléments disponibles sur… ?', 'query.ask': 'Interroger le cerveau', 'query.processing': 'Traitement', 'query.searching': 'Eva parcourt le cerveau et remonte les sources…', 'query.answer': 'Réponse', 'query.save': 'Enregistrer comme analyse', 'query.evidence': 'Sources',
    'library.kicker': 'Votre bibliothèque', 'library.title': 'Vos cerveaux', 'library.copy': 'Choisissez un cerveau qu’Eva conserve déjà dans Documents/Eva/Brains ou importez-en un autre.', 'library.manage': 'Gérer les cerveaux', 'library.import': 'Importer un cerveau', 'library.new': 'Nouveau cerveau',
    'manager.kicker': 'Bibliothèque locale', 'manager.title': 'Gestionnaire de cerveaux', 'manager.copy': 'Voyez où se trouve chaque cerveau et définissez le profil qu’Eva utilise pour y travailler.', 'manager.shelf': 'Vos cerveaux', 'manager.language': 'Langue de travail', 'manager.runtime': 'IA', 'manager.codex': 'Utiliser la CLI Codex connectée sur ce Mac.', 'manager.claude': 'Utiliser la CLI Claude connectée sur ce Mac.', 'manager.purpose': 'À quoi sert ce cerveau ?', 'common.optional': 'Facultatif', 'manager.save': 'Enregistrer les changements',
    'new.kicker': 'Première page', 'new.title': 'Nouveau cerveau', 'new.copy': 'Définissez le cadre de ce projet de connaissance. Eva enregistre ces choix dans le schéma local que votre IA lit avant de travailler.', 'new.name': 'Nom du cerveau', 'new.namePlaceholder': 'Atlas de recherche', 'new.language': 'Langue de travail', 'new.runtime': 'IA', 'new.codex': 'Utiliser la CLI Codex connectée sur ce Mac.', 'new.claude': 'Utiliser la CLI Claude connectée sur ce Mac.', 'new.credentials': 'Eva ne conserve aucun identifiant. L’IA choisie est enregistrée avec ce cerveau local.', 'new.purpose': 'À quoi sert ce cerveau ?', 'new.purposePlaceholder': 'Suivre un sujet, préparer un voyage, comprendre une entreprise…', 'new.directory': 'Vos cerveaux', 'new.directoryCopy': 'Eva les crée et les conserve dans Documents/Eva/Brains.', 'new.cancel': 'Annuler', 'new.create': 'Créer un cerveau',
    'settings.kicker': 'Eva', 'settings.title': 'Réglages de l’application', 'settings.copy': 'Choisissez la langue de l’interface d’Eva. Cela ne modifie pas la langue de travail d’un cerveau.', 'settings.language': 'Langue de l’application', 'settings.system': 'Utiliser la langue du système', 'settings.hint': 'Enregistré uniquement sur cet appareil.', 'aria.home': 'Revenir à la page d’accueil d’Eva', 'aria.close': 'Fermer',
  },
  de: {
    'home.kicker': 'LLM-Gehirn', 'home.title': 'Mit einem Gehirn beginnen', 'home.copy': 'Eva verwandelt ausgewählte Quellen in einen gepflegten, verknüpften Wissensbestand. Erstelle ein Gehirn oder öffne eines, das bereits auf deinem Laufwerk liegt.',
    'home.create.title': 'Neues Gehirn erstellen', 'home.create.detail': 'Sprache, Zweck und KI-Einrichtung festlegen.', 'home.open.title': 'Vorhandenes Gehirn öffnen', 'home.open.detail': 'Einen lokalen Markdown-Ordner als Graph lesen.', 'home.manage': 'Lokale Gehirne verwalten', 'home.settings': 'App-Einstellungen', 'recent.label': 'Zuletzt verwendet',
    'nav.home': 'Start', 'nav.new': 'Neues Gehirn', 'nav.open': 'Gehirn öffnen', 'nav.manage': 'Gehirne verwalten', 'nav.settings': 'Einstellungen', 'nav.noBrain': 'Kein Gehirn geöffnet',
    'op.ingest': 'Aufnehmen', 'op.query': 'Abfragen', 'op.health': 'Zustand', 'op.log': 'Protokoll', 'op.reorganize': 'Neu anordnen', 'type.index': 'Index', 'type.entity': 'Entität', 'type.concept': 'Konzept', 'type.summary': 'Zusammenfassung', 'type.analysis': 'Analyse', 'type.person': 'Person', 'type.project': 'Projekt', 'type.note': 'Notiz', 'type.log': 'Protokoll', 'type.untyped': 'Ohne Typ', 'health.title': 'Zustand', 'log.title': 'Protokoll', 'review.title': 'Änderungen prüfen', 'review.accept': 'Akzeptieren und zusammenführen', 'review.reject': 'Verwerfen',
    'query.kicker': 'Bestand befragen', 'query.title': 'Gehirn abfragen', 'query.copy': 'Eva liest das aktuelle Gehirn und gibt eine belegte Antwort zurück. Eine Abfrage ändert es nicht; Speichern erstellt eine prüfbare Analyse-Seite.', 'query.question': 'Frage', 'query.placeholder': 'Was legen die Belege zu … nahe?', 'query.ask': 'Gehirn abfragen', 'query.processing': 'Wird verarbeitet', 'query.searching': 'Eva durchsucht das Gehirn und verfolgt die Quellen…', 'query.answer': 'Antwort', 'query.save': 'Als Analyse speichern', 'query.evidence': 'Belege',
    'library.kicker': 'Deine Bibliothek', 'library.title': 'Deine Gehirne', 'library.copy': 'Wähle ein Gehirn, das Eva bereits in Documents/Eva/Brains aufbewahrt, oder importiere eines von anderswo.', 'library.manage': 'Gehirne verwalten', 'library.import': 'Gehirn importieren', 'library.new': 'Neues Gehirn',
    'manager.kicker': 'Lokale Bibliothek', 'manager.title': 'Gehirnverwaltung', 'manager.copy': 'Sieh, wo jedes Gehirn liegt, und lege das Profil fest, das Eva dort verwendet.', 'manager.shelf': 'Deine Gehirne', 'manager.language': 'Arbeitssprache', 'manager.runtime': 'KI-Laufzeit', 'manager.codex': 'Die auf diesem Mac angemeldete Codex-CLI verwenden.', 'manager.claude': 'Die auf diesem Mac angemeldete Claude-CLI verwenden.', 'manager.purpose': 'Wofür ist dieses Gehirn?', 'common.optional': 'Optional', 'manager.save': 'Änderungen speichern',
    'new.kicker': 'Erste Seite', 'new.title': 'Neues Gehirn', 'new.copy': 'Lege den Rahmen für dieses Wissensprojekt fest. Eva speichert diese Auswahl im lokalen Schema, das deine KI vor der Arbeit liest.', 'new.name': 'Name des Gehirns', 'new.namePlaceholder': 'Forschungsatlas', 'new.language': 'Arbeitssprache', 'new.runtime': 'KI-Laufzeit', 'new.codex': 'Die auf diesem Mac angemeldete Codex-CLI verwenden.', 'new.claude': 'Die auf diesem Mac angemeldete Claude-CLI verwenden.', 'new.credentials': 'Eva speichert keine Zugangsdaten. Die gewählte KI wird mit diesem lokalen Gehirn gespeichert.', 'new.purpose': 'Wofür ist dieses Gehirn?', 'new.purposePlaceholder': 'Ein Forschungsthema verfolgen, eine Reise planen, ein Unternehmen verstehen …', 'new.directory': 'Deine Gehirne', 'new.directoryCopy': 'Eva erstellt und speichert sie in Documents/Eva/Brains.', 'new.cancel': 'Abbrechen', 'new.create': 'Gehirn erstellen',
    'settings.kicker': 'Eva', 'settings.title': 'App-Einstellungen', 'settings.copy': 'Wähle die Sprache der Eva-Oberfläche. Die Arbeitssprache eines Gehirns bleibt unverändert.', 'settings.language': 'App-Sprache', 'settings.system': 'Systemsprache verwenden', 'settings.hint': 'Nur auf diesem Gerät gespeichert.', 'aria.home': 'Zur Startseite von Eva zurückkehren', 'aria.close': 'Schließen',
  },
  it: {
    'home.kicker': 'Cervello LLM', 'home.title': 'Inizia con un cervello', 'home.copy': 'Eva trasforma fonti selezionate in un insieme di conoscenze mantenuto e interconnesso. Crea un cervello o aprine uno già sul disco.',
    'home.create.title': 'Crea un cervello', 'home.create.detail': 'Imposta lingua, scopo e configurazione IA.', 'home.open.title': 'Apri un cervello esistente', 'home.open.detail': 'Leggi una cartella Markdown locale come grafo.', 'home.manage': 'Gestisci i miei cervelli locali', 'home.settings': 'Impostazioni dell’app', 'recent.label': 'Recenti',
    'nav.home': 'Home', 'nav.new': 'Nuovo cervello', 'nav.open': 'Apri cervello', 'nav.manage': 'Gestisci cervelli', 'nav.settings': 'Impostazioni', 'nav.noBrain': 'Nessun cervello aperto',
    'op.ingest': 'Importa', 'op.query': 'Interroga', 'op.health': 'Stato', 'op.log': 'Registro', 'op.reorganize': 'Riorganizza', 'type.index': 'Indice', 'type.entity': 'Entità', 'type.concept': 'Concetto', 'type.summary': 'Riepilogo', 'type.analysis': 'Analisi', 'type.person': 'Persona', 'type.project': 'Progetto', 'type.note': 'Nota', 'type.log': 'Registro', 'type.untyped': 'Senza tipo', 'health.title': 'Stato', 'log.title': 'Registro', 'review.title': 'Rivedi modifiche', 'review.accept': 'Accetta e unisci', 'review.reject': 'Rifiuta',
    'query.kicker': 'Interroga l’archivio', 'query.title': 'Interroga il cervello', 'query.copy': 'Eva legge il cervello corrente e restituisce una risposta con citazioni. Interrogare non lo modifica; salvare crea una pagina di analisi rivedibile.', 'query.question': 'Domanda', 'query.placeholder': 'Cosa suggeriscono le evidenze su…?', 'query.ask': 'Interroga cervello', 'query.processing': 'Elaborazione', 'query.searching': 'Eva sta cercando nel cervello e tracciando le fonti…', 'query.answer': 'Risposta', 'query.save': 'Salva come analisi', 'query.evidence': 'Evidenze',
    'library.kicker': 'La tua libreria', 'library.title': 'I tuoi cervelli', 'library.copy': 'Scegli un cervello che Eva conserva già in Documents/Eva/Brains o importane uno da un’altra posizione.', 'library.manage': 'Gestisci cervelli', 'library.import': 'Importa un cervello', 'library.new': 'Nuovo cervello',
    'manager.kicker': 'Libreria locale', 'manager.title': 'Gestore dei cervelli', 'manager.copy': 'Vedi dove si trova ogni cervello e imposta il profilo che Eva usa per lavorarci.', 'manager.shelf': 'I tuoi cervelli', 'manager.language': 'Lingua di lavoro', 'manager.runtime': 'IA', 'manager.codex': 'Usa la CLI Codex autenticata su questo Mac.', 'manager.claude': 'Usa la CLI Claude autenticata su questo Mac.', 'manager.purpose': 'A cosa serve questo cervello?', 'common.optional': 'Facoltativo', 'manager.save': 'Salva modifiche',
    'new.kicker': 'Prima pagina', 'new.title': 'Nuovo cervello', 'new.copy': 'Definisci il contesto di questo progetto di conoscenza. Eva salva queste scelte nello schema locale che la tua IA legge prima di lavorare.', 'new.name': 'Nome del cervello', 'new.namePlaceholder': 'Atlante di ricerca', 'new.language': 'Lingua di lavoro', 'new.runtime': 'IA', 'new.codex': 'Usa la CLI Codex autenticata su questo Mac.', 'new.claude': 'Usa la CLI Claude autenticata su questo Mac.', 'new.credentials': 'Eva non conserva credenziali. L’IA scelta viene salvata in questo cervello locale.', 'new.purpose': 'A cosa serve questo cervello?', 'new.purposePlaceholder': 'Seguire un tema di ricerca, pianificare un viaggio, capire un’azienda…', 'new.directory': 'I tuoi cervelli', 'new.directoryCopy': 'Eva li crea e conserva in Documents/Eva/Brains.', 'new.cancel': 'Annulla', 'new.create': 'Crea cervello',
    'settings.kicker': 'Eva', 'settings.title': 'Impostazioni dell’app', 'settings.copy': 'Scegli la lingua dell’interfaccia Eva. Non modifica la lingua di lavoro di un cervello.', 'settings.language': 'Lingua dell’app', 'settings.system': 'Usa la lingua di sistema', 'settings.hint': 'Salvato solo su questo dispositivo.', 'aria.home': 'Torna alla pagina iniziale di Eva', 'aria.close': 'Chiudi',
  },
  ja: {
    'home.kicker': 'LLM ブレイン', 'home.title': 'ブレインから始める', 'home.copy': 'Eva は厳選した情報源を、維持・相互接続された知識の集合へと変換します。新しいブレインを作成するか、ディスク上の既存のブレインを開いてください。',
    'home.create.title': '新しいブレインを作成', 'home.create.detail': '言語、目的、AI の設定を指定します。', 'home.open.title': '既存のブレインを開く', 'home.open.detail': 'ローカルの Markdown フォルダをグラフとして読みます。', 'home.manage': 'ローカルのブレインを管理', 'home.settings': 'アプリ設定', 'recent.label': '最近使った項目',
    'nav.home': 'ホーム', 'nav.new': '新しいブレイン', 'nav.open': 'ブレインを開く', 'nav.manage': 'ブレインを管理', 'nav.settings': '設定', 'nav.noBrain': 'ブレインが開かれていません',
    'op.ingest': '取り込む', 'op.query': '質問', 'op.health': '状態', 'op.log': 'ログ', 'op.reorganize': '再配置', 'type.index': '索引', 'type.entity': 'エンティティ', 'type.concept': '概念', 'type.summary': '要約', 'type.analysis': '分析', 'type.person': '人物', 'type.project': 'プロジェクト', 'type.note': 'ノート', 'type.log': 'ログ', 'type.untyped': '種類なし', 'health.title': '状態', 'log.title': 'ログ', 'review.title': '変更を確認', 'review.accept': '承認して統合', 'review.reject': '却下',
    'query.kicker': '記録に尋ねる', 'query.title': 'ブレインに質問', 'query.copy': 'Eva は現在のブレインを読み、引用付きの回答を返します。質問では変更されず、保存すると確認可能な分析ページが作成されます。', 'query.question': '質問', 'query.placeholder': '根拠から何が示唆されますか…？', 'query.ask': 'ブレインに質問', 'query.processing': '処理中', 'query.searching': 'Eva がブレインを検索し、情報源をたどっています…', 'query.answer': '回答', 'query.save': '分析として保存', 'query.evidence': '根拠',
    'library.kicker': 'ライブラリ', 'library.title': 'あなたのブレイン', 'library.copy': 'Documents/Eva/Brains に Eva が保存しているブレインを選ぶか、別の場所からインポートしてください。', 'library.manage': 'ブレインを管理', 'library.import': 'ブレインをインポート', 'library.new': '新しいブレイン',
    'manager.kicker': 'ローカルライブラリ', 'manager.title': 'ブレイン管理', 'manager.copy': '各ブレインの場所を確認し、Eva が作業に使用するプロファイルを設定します。', 'manager.shelf': 'あなたのブレイン', 'manager.language': '作業言語', 'manager.runtime': 'AI ランタイム', 'manager.codex': 'この Mac でサインイン済みの Codex CLI を使用します。', 'manager.claude': 'この Mac でサインイン済みの Claude CLI を使用します。', 'manager.purpose': 'このブレインの目的は？', 'common.optional': '任意', 'manager.save': '変更を保存',
    'new.kicker': '最初のページ', 'new.title': '新しいブレイン', 'new.copy': 'この知識プロジェクトの枠組みを設定します。Eva は、AI が作業前に読むローカルスキーマにこの選択を保存します。', 'new.name': 'ブレイン名', 'new.namePlaceholder': 'リサーチアトラス', 'new.language': '作業言語', 'new.runtime': 'AI ランタイム', 'new.codex': 'この Mac でサインイン済みの Codex CLI を使用します。', 'new.claude': 'この Mac でサインイン済みの Claude CLI を使用します。', 'new.credentials': 'Eva は認証情報を保存しません。選択した AI はこのローカルブレインに保存されます。', 'new.purpose': 'このブレインの目的は？', 'new.purposePlaceholder': '研究テーマを追う、旅行を計画する、企業を理解する…', 'new.directory': 'あなたのブレイン', 'new.directoryCopy': 'Eva は Documents/Eva/Brains に作成・保存します。', 'new.cancel': 'キャンセル', 'new.create': 'ブレインを作成',
    'settings.kicker': 'Eva', 'settings.title': 'アプリ設定', 'settings.copy': 'Eva のインターフェースで使う言語を選択します。ブレインの作業言語は変更されません。', 'settings.language': 'アプリの言語', 'settings.system': 'システム言語を使用', 'settings.hint': 'このデバイスにのみ保存されます。', 'aria.home': 'Eva の開始画面に戻る', 'aria.close': '閉じる',
  },
  ko: {
    'home.kicker': 'LLM 브레인', 'home.title': '브레인으로 시작하기', 'home.copy': 'Eva는 선별한 자료를 유지·연결되는 지식 모음으로 바꿉니다. 새 브레인을 만들거나 디스크에 있는 브레인을 여세요.',
    'home.create.title': '새 브레인 만들기', 'home.create.detail': '언어, 목적, AI 설정을 정합니다.', 'home.open.title': '기존 브레인 열기', 'home.open.detail': '로컬 Markdown 폴더를 그래프로 읽습니다.', 'home.manage': '로컬 브레인 관리', 'home.settings': '앱 설정', 'recent.label': '최근 항목',
    'nav.home': '홈', 'nav.new': '새 브레인', 'nav.open': '브레인 열기', 'nav.manage': '브레인 관리', 'nav.settings': '설정', 'nav.noBrain': '열린 브레인이 없습니다',
    'op.ingest': '수집', 'op.query': '질문', 'op.health': '상태', 'op.log': '기록', 'op.reorganize': '재정리', 'type.index': '색인', 'type.entity': '엔터티', 'type.concept': '개념', 'type.summary': '요약', 'type.analysis': '분석', 'type.person': '인물', 'type.project': '프로젝트', 'type.note': '노트', 'type.log': '기록', 'type.untyped': '유형 없음', 'health.title': '상태', 'log.title': '기록', 'review.title': '변경 검토', 'review.accept': '수락 및 병합', 'review.reject': '거절',
    'query.kicker': '기록에 묻기', 'query.title': '브레인에 질문', 'query.copy': 'Eva는 현재 브레인을 읽고 인용이 포함된 답을 반환합니다. 질문은 브레인을 바꾸지 않으며, 저장하면 검토 가능한 분석 페이지가 생성됩니다.', 'query.question': '질문', 'query.placeholder': '근거는 무엇을 시사하나요…?', 'query.ask': '브레인에 질문', 'query.processing': '처리 중', 'query.searching': 'Eva가 브레인을 검색하고 출처를 추적하고 있습니다…', 'query.answer': '답변', 'query.save': '분석으로 저장', 'query.evidence': '근거',
    'library.kicker': '내 라이브러리', 'library.title': '내 브레인', 'library.copy': 'Documents/Eva/Brains에 Eva가 보관한 브레인을 선택하거나 다른 위치에서 가져오세요.', 'library.manage': '브레인 관리', 'library.import': '브레인 가져오기', 'library.new': '새 브레인',
    'manager.kicker': '로컬 라이브러리', 'manager.title': '브레인 관리자', 'manager.copy': '각 브레인의 위치를 보고 Eva가 작업할 때 사용할 프로필을 설정하세요.', 'manager.shelf': '내 브레인', 'manager.language': '작업 언어', 'manager.runtime': 'AI 런타임', 'manager.codex': '이 Mac에 로그인된 Codex CLI를 사용합니다.', 'manager.claude': '이 Mac에 로그인된 Claude CLI를 사용합니다.', 'manager.purpose': '이 브레인은 무엇을 위한 것인가요?', 'common.optional': '선택 사항', 'manager.save': '변경 사항 저장',
    'new.kicker': '첫 페이지', 'new.title': '새 브레인', 'new.copy': '이 지식 프로젝트의 틀을 정합니다. Eva는 AI가 작업 전 읽는 로컬 스키마에 이 선택을 저장합니다.', 'new.name': '브레인 이름', 'new.namePlaceholder': '리서치 아틀라스', 'new.language': '작업 언어', 'new.runtime': 'AI 런타임', 'new.codex': '이 Mac에 로그인된 Codex CLI를 사용합니다.', 'new.claude': '이 Mac에 로그인된 Claude CLI를 사용합니다.', 'new.credentials': 'Eva는 자격 증명을 저장하지 않습니다. 선택한 AI는 이 로컬 브레인에 저장됩니다.', 'new.purpose': '이 브레인은 무엇을 위한 것인가요?', 'new.purposePlaceholder': '연구 주제 추적, 여행 계획, 기업 이해…', 'new.directory': '내 브레인', 'new.directoryCopy': 'Eva가 Documents/Eva/Brains에 만들고 보관합니다.', 'new.cancel': '취소', 'new.create': '브레인 만들기',
    'settings.kicker': 'Eva', 'settings.title': '앱 설정', 'settings.copy': 'Eva 인터페이스에서 사용할 언어를 선택하세요. 브레인의 작업 언어는 바뀌지 않습니다.', 'settings.language': '앱 언어', 'settings.system': '시스템 언어 사용', 'settings.hint': '이 기기에만 저장됩니다.', 'aria.home': 'Eva 시작 화면으로 돌아가기', 'aria.close': '닫기',
  },
  'zh-Hans': {
    'home.kicker': 'LLM 大脑', 'home.title': '从一个大脑开始', 'home.copy': 'Eva 将精选来源转化为持续维护、彼此关联的知识体系。创建一个大脑，或打开磁盘中已有的大脑。',
    'home.create.title': '创建新大脑', 'home.create.detail': '设置语言、用途和 AI 配置。', 'home.open.title': '打开已有大脑', 'home.open.detail': '将本地 Markdown 文件夹作为图谱读取。', 'home.manage': '管理本地大脑', 'home.settings': '应用设置', 'recent.label': '最近使用',
    'nav.home': '主页', 'nav.new': '新建大脑', 'nav.open': '打开大脑', 'nav.manage': '管理大脑', 'nav.settings': '设置', 'nav.noBrain': '未打开大脑',
    'op.ingest': '导入', 'op.query': '提问', 'op.health': '健康', 'op.log': '日志', 'op.reorganize': '重新整理', 'type.index': '索引', 'type.entity': '实体', 'type.concept': '概念', 'type.summary': '摘要', 'type.analysis': '分析', 'type.person': '人物', 'type.project': '项目', 'type.note': '笔记', 'type.log': '日志', 'type.untyped': '未分类', 'health.title': '健康', 'log.title': '日志', 'review.title': '审查更改', 'review.accept': '接受并合并', 'review.reject': '拒绝',
    'query.kicker': '询问记录', 'query.title': '询问大脑', 'query.copy': 'Eva 会读取当前大脑并返回带引用的回答。提问不会修改它；保存会创建可审查的分析页面。', 'query.question': '问题', 'query.placeholder': '证据表明了什么…？', 'query.ask': '询问大脑', 'query.processing': '正在处理', 'query.searching': 'Eva 正在搜索大脑并追溯来源…', 'query.answer': '回答', 'query.save': '保存为分析', 'query.evidence': '证据',
    'library.kicker': '你的资料库', 'library.title': '你的大脑', 'library.copy': '选择 Eva 已保存在 Documents/Eva/Brains 中的大脑，或从其他位置导入一个。', 'library.manage': '管理大脑', 'library.import': '导入大脑', 'library.new': '新建大脑',
    'manager.kicker': '本地资料库', 'manager.title': '大脑管理器', 'manager.copy': '查看每个大脑的位置，并设置 Eva 在其中工作时使用的配置。', 'manager.shelf': '你的大脑', 'manager.language': '工作语言', 'manager.runtime': 'AI 运行环境', 'manager.codex': '使用此 Mac 上已登录的 Codex CLI。', 'manager.claude': '使用此 Mac 上已登录的 Claude CLI。', 'manager.purpose': '这个大脑用于什么？', 'common.optional': '可选', 'manager.save': '保存更改',
    'new.kicker': '第一页', 'new.title': '新建大脑', 'new.copy': '为这个知识项目设定框架。Eva 会将这些选择保存到 AI 工作前读取的本地架构中。', 'new.name': '大脑名称', 'new.namePlaceholder': '研究图谱', 'new.language': '工作语言', 'new.runtime': 'AI 运行环境', 'new.codex': '使用此 Mac 上已登录的 Codex CLI。', 'new.claude': '使用此 Mac 上已登录的 Claude CLI。', 'new.credentials': 'Eva 不保存凭据。所选 AI 会保存在这个本地大脑中。', 'new.purpose': '这个大脑用于什么？', 'new.purposePlaceholder': '追踪研究主题、规划旅行、了解一家公司…', 'new.directory': '你的大脑', 'new.directoryCopy': 'Eva 会在 Documents/Eva/Brains 中创建并保存它们。', 'new.cancel': '取消', 'new.create': '创建大脑',
    'settings.kicker': 'Eva', 'settings.title': '应用设置', 'settings.copy': '选择 Eva 界面使用的语言。这不会改变大脑的工作语言。', 'settings.language': '应用语言', 'settings.system': '使用系统语言', 'settings.hint': '仅保存在此设备上。', 'aria.home': '返回 Eva 的起始页', 'aria.close': '关闭',
  },
  'zh-Hant': {
    'home.kicker': 'LLM 大腦', 'home.title': '從一個大腦開始', 'home.copy': 'Eva 將精選來源轉化為持續維護、彼此連結的知識體系。建立一個大腦，或開啟磁碟中已有的大腦。',
    'home.create.title': '建立新大腦', 'home.create.detail': '設定語言、用途與 AI 設定。', 'home.open.title': '開啟已有大腦', 'home.open.detail': '將本機 Markdown 資料夾作為圖譜讀取。', 'home.manage': '管理本機大腦', 'home.settings': '應用程式設定', 'recent.label': '最近使用',
    'nav.home': '首頁', 'nav.new': '新增大腦', 'nav.open': '開啟大腦', 'nav.manage': '管理大腦', 'nav.settings': '設定', 'nav.noBrain': '尚未開啟大腦',
    'op.ingest': '匯入', 'op.query': '提問', 'op.health': '健康', 'op.log': '日誌', 'op.reorganize': '重新整理', 'type.index': '索引', 'type.entity': '實體', 'type.concept': '概念', 'type.summary': '摘要', 'type.analysis': '分析', 'type.person': '人物', 'type.project': '專案', 'type.note': '筆記', 'type.log': '日誌', 'type.untyped': '未分類', 'health.title': '健康', 'log.title': '日誌', 'review.title': '檢閱變更', 'review.accept': '接受並合併', 'review.reject': '拒絕',
    'query.kicker': '詢問記錄', 'query.title': '詢問大腦', 'query.copy': 'Eva 會讀取目前的大腦並傳回附有引用的回答。提問不會修改它；儲存會建立可檢閱的分析頁面。', 'query.question': '問題', 'query.placeholder': '證據顯示了什麼…？', 'query.ask': '詢問大腦', 'query.processing': '處理中', 'query.searching': 'Eva 正在搜尋大腦並追溯來源…', 'query.answer': '回答', 'query.save': '儲存為分析', 'query.evidence': '證據',
    'library.kicker': '你的資料庫', 'library.title': '你的大腦', 'library.copy': '選擇 Eva 已儲存在 Documents/Eva/Brains 中的大腦，或從其他位置匯入一個。', 'library.manage': '管理大腦', 'library.import': '匯入大腦', 'library.new': '新增大腦',
    'manager.kicker': '本機資料庫', 'manager.title': '大腦管理器', 'manager.copy': '查看每個大腦的位置，並設定 Eva 在其中工作時使用的設定檔。', 'manager.shelf': '你的大腦', 'manager.language': '工作語言', 'manager.runtime': 'AI 執行環境', 'manager.codex': '使用此 Mac 上已登入的 Codex CLI。', 'manager.claude': '使用此 Mac 上已登入的 Claude CLI。', 'manager.purpose': '這個大腦用於什麼？', 'common.optional': '選填', 'manager.save': '儲存變更',
    'new.kicker': '第一頁', 'new.title': '新增大腦', 'new.copy': '為這個知識專案設定框架。Eva 會將這些選擇儲存到 AI 工作前讀取的本機架構中。', 'new.name': '大腦名稱', 'new.namePlaceholder': '研究圖譜', 'new.language': '工作語言', 'new.runtime': 'AI 執行環境', 'new.codex': '使用此 Mac 上已登入的 Codex CLI。', 'new.claude': '使用此 Mac 上已登入的 Claude CLI。', 'new.credentials': 'Eva 不會儲存憑證。選取的 AI 會儲存在這個本機大腦中。', 'new.purpose': '這個大腦用於什麼？', 'new.purposePlaceholder': '追蹤研究主題、規劃旅行、了解一家公司…', 'new.directory': '你的大腦', 'new.directoryCopy': 'Eva 會在 Documents/Eva/Brains 中建立並儲存它們。', 'new.cancel': '取消', 'new.create': '建立大腦',
    'settings.kicker': 'Eva', 'settings.title': '應用程式設定', 'settings.copy': '選擇 Eva 介面使用的語言。這不會變更大腦的工作語言。', 'settings.language': '應用程式語言', 'settings.system': '使用系統語言', 'settings.hint': '僅儲存在此裝置上。', 'aria.home': '返回 Eva 的起始頁', 'aria.close': '關閉',
  },
};

function systemLocale(): Locale {
  const tag = navigator.language.toLowerCase();
  if (tag.startsWith('zh')) return /tw|hk|mo|hant/.test(tag) ? 'zh-Hant' : 'zh-Hans';
  if (tag.startsWith('es')) return 'es';
  if (tag.startsWith('pt')) return 'pt';
  if (tag.startsWith('fr')) return 'fr';
  if (tag.startsWith('de')) return 'de';
  if (tag.startsWith('it')) return 'it';
  if (tag.startsWith('ja')) return 'ja';
  if (tag.startsWith('ko')) return 'ko';
  return 'en';
}

function storedPreference(): AppLanguage {
  try {
    const saved = localStorage.getItem(APP_LANGUAGE_PREFERENCE_KEY);
    return saved === 'system' || locales.includes(saved as Locale) ? (saved as AppLanguage) : 'system';
  } catch {
    return 'system';
  }
}

let preference = storedPreference();
let activeLocale = preference === 'system' ? systemLocale() : preference;

export function appLanguagePreference(): AppLanguage {
  return preference;
}

export function currentLocale(): Locale {
  return activeLocale;
}

export function setAppLanguage(next: AppLanguage): Locale {
  preference = next;
  activeLocale = next === 'system' ? systemLocale() : next;
  try {
    localStorage.setItem(APP_LANGUAGE_PREFERENCE_KEY, next);
  } catch {
    // The interface remains translated for this session if browser storage is unavailable.
  }
  return activeLocale;
}

export function t(key: TranslationKey): string {
  return dictionaries[activeLocale][key] ?? english[key];
}

const chrome = {
  'profile.personal': 'Personal', 'profile.research': 'Research', 'profile.reading': 'Reading companion', 'profile.business': 'Business record', 'profile.planning': 'Planning', 'profile.course': 'Course and learning', 'profile.blank': 'Blank / custom',
  'tool.personal-review': 'Reflection', 'tool.evidence-map': 'Evidence map', 'tool.reading-threads': 'Threads map', 'tool.decision-brief': 'Decision brief', 'tool.options-review': 'Options review', 'tool.flashcards': 'Flashcards', 'tool.practice-exam': 'Practice exam',
  'profile.field': 'Brain profile', 'profile.modules': '{{count}} modules', 'profile.detail': 'Choose the working mode that best fits this brain.',
  'tool.detail': 'Create source-cited work from the brain that is currently open.', 'tool.other': 'Other tools · {{count}}', 'tool.otherCopy': 'Use any tool with this brain. Eva works only from the brain you have open.', 'tool.focus': 'Topics or focus', 'tool.focusPlaceholder': 'Leave empty to use the whole brain.', 'tool.format': 'Exam format', 'tool.questions': 'Questions', 'tool.run': 'Run {{tool}}', 'tool.result': 'Result', 'tool.primary': 'Primary tool for this brain', 'tool.crossProfile': 'From the {{profile}} profile · uses this open brain', 'tool.none': 'No supporting brain pages were returned for this result.', 'format.mixed': 'Mixed', 'format.multiple-choice': 'Multiple choice', 'format.written': 'Written responses', 'format.short-answer': 'Short answer',
  'reader.empty': 'This page has no readable body yet.', 'reader.done': 'Done', 'reader.todo': 'To do',
  'library.loading': 'Reading your brains…', 'library.empty': 'No brains here yet. Create one or import an existing one.', 'manager.loading': 'Reading your local library…', 'manager.empty': 'No local brains yet. Create or import one to configure it here.',
} as const;

export type ChromeKey = keyof typeof chrome;
type ChromeDictionary = Partial<Record<ChromeKey, string>>;

const chromeTranslations: Record<Locale, ChromeDictionary> = {
  en: {},
  es: {
    'profile.personal': 'Personal', 'profile.research': 'Investigación', 'profile.reading': 'Acompañamiento de lectura', 'profile.business': 'Registro empresarial', 'profile.planning': 'Planificación', 'profile.course': 'Curso y aprendizaje', 'profile.blank': 'En blanco / personalizado',
    'tool.personal-review': 'Reflexión', 'tool.evidence-map': 'Mapa de evidencia', 'tool.reading-threads': 'Mapa de tramas', 'tool.decision-brief': 'Resumen de decisión', 'tool.options-review': 'Revisión de opciones', 'tool.flashcards': 'Tarjetas de estudio', 'tool.practice-exam': 'Examen de práctica',
    'profile.field': 'Perfil del cerebro', 'profile.modules': '{{count}} módulos', 'profile.detail': 'Elige el modo de trabajo que mejor encaje con este cerebro.', 'tool.detail': 'Crea trabajo con citas a partir del cerebro que está abierto.', 'tool.other': 'Otras herramientas · {{count}}', 'tool.otherCopy': 'Usa cualquier herramienta con este cerebro. Eva trabaja solo con el cerebro abierto.', 'tool.focus': 'Temas o enfoque', 'tool.focusPlaceholder': 'Déjalo vacío para usar todo el cerebro.', 'tool.format': 'Formato del examen', 'tool.questions': 'Preguntas', 'tool.run': 'Ejecutar {{tool}}', 'tool.result': 'Resultado', 'tool.primary': 'Herramienta principal de este cerebro', 'tool.crossProfile': 'Del perfil {{profile}} · usa este cerebro abierto', 'tool.none': 'No se devolvieron páginas de apoyo para este resultado.', 'format.mixed': 'Mixto', 'format.multiple-choice': 'Opción múltiple', 'format.written': 'Respuestas escritas', 'format.short-answer': 'Respuesta corta', 'reader.empty': 'Esta página aún no tiene contenido legible.', 'reader.done': 'Hecho', 'reader.todo': 'Pendiente', 'library.loading': 'Leyendo tus cerebros…', 'library.empty': 'Aún no hay cerebros aquí. Crea uno o importa uno existente.', 'manager.loading': 'Leyendo tu biblioteca local…', 'manager.empty': 'Aún no hay cerebros locales. Crea o importa uno para configurarlo aquí.',
  },
  pt: {
    'profile.personal': 'Pessoal', 'profile.research': 'Pesquisa', 'profile.reading': 'Acompanhamento de leitura', 'profile.business': 'Registro empresarial', 'profile.planning': 'Planejamento', 'profile.course': 'Curso e aprendizagem', 'profile.blank': 'Em branco / personalizado',
    'tool.personal-review': 'Reflexão', 'tool.evidence-map': 'Mapa de evidências', 'tool.reading-threads': 'Mapa de tramas', 'tool.decision-brief': 'Resumo de decisão', 'tool.options-review': 'Revisão de opções', 'tool.flashcards': 'Flashcards', 'tool.practice-exam': 'Prova prática',
    'profile.field': 'Perfil do cérebro', 'profile.modules': '{{count}} módulos', 'profile.detail': 'Escolha o modo de trabalho que melhor se encaixa neste cérebro.', 'tool.detail': 'Crie trabalho com citações a partir do cérebro aberto.', 'tool.other': 'Outras ferramentas · {{count}}', 'tool.otherCopy': 'Use qualquer ferramenta com este cérebro. Eva trabalha apenas com o cérebro aberto.', 'tool.focus': 'Tópicos ou foco', 'tool.focusPlaceholder': 'Deixe vazio para usar todo o cérebro.', 'tool.format': 'Formato da prova', 'tool.questions': 'Questões', 'tool.run': 'Executar {{tool}}', 'tool.result': 'Resultado', 'tool.primary': 'Ferramenta principal deste cérebro', 'tool.crossProfile': 'Do perfil {{profile}} · usa este cérebro aberto', 'tool.none': 'Nenhuma página de apoio foi retornada para este resultado.', 'format.mixed': 'Misto', 'format.multiple-choice': 'Múltipla escolha', 'format.written': 'Respostas escritas', 'format.short-answer': 'Resposta curta', 'reader.empty': 'Esta página ainda não tem conteúdo legível.', 'reader.done': 'Concluído', 'reader.todo': 'A fazer', 'library.loading': 'Lendo seus cérebros…', 'library.empty': 'Ainda não há cérebros aqui. Crie ou importe um existente.', 'manager.loading': 'Lendo sua biblioteca local…', 'manager.empty': 'Ainda não há cérebros locais. Crie ou importe um para configurá-lo aqui.',
  },
  fr: {
    'profile.personal': 'Personnel', 'profile.research': 'Recherche', 'profile.reading': 'Compagnon de lecture', 'profile.business': 'Dossier d’entreprise', 'profile.planning': 'Planification', 'profile.course': 'Cours et apprentissage', 'profile.blank': 'Vide / personnalisé',
    'tool.personal-review': 'Réflexion', 'tool.evidence-map': 'Carte des preuves', 'tool.reading-threads': 'Carte des fils', 'tool.decision-brief': 'Note de décision', 'tool.options-review': 'Revue des options', 'tool.flashcards': 'Cartes mémoire', 'tool.practice-exam': 'Examen d’entraînement',
    'profile.field': 'Profil du cerveau', 'profile.modules': '{{count}} modules', 'profile.detail': 'Choisissez le mode de travail adapté à ce cerveau.', 'tool.detail': 'Créez un travail sourcé à partir du cerveau ouvert.', 'tool.other': 'Autres outils · {{count}}', 'tool.otherCopy': 'Utilisez n’importe quel outil avec ce cerveau. Eva travaille seulement à partir du cerveau ouvert.', 'tool.focus': 'Sujets ou axe', 'tool.focusPlaceholder': 'Laissez vide pour utiliser tout le cerveau.', 'tool.format': 'Format de l’examen', 'tool.questions': 'Questions', 'tool.run': 'Lancer {{tool}}', 'tool.result': 'Résultat', 'tool.primary': 'Outil principal de ce cerveau', 'tool.crossProfile': 'Du profil {{profile}} · utilise ce cerveau ouvert', 'tool.none': 'Aucune page de soutien n’a été renvoyée pour ce résultat.', 'format.mixed': 'Mixte', 'format.multiple-choice': 'Choix multiple', 'format.written': 'Réponses écrites', 'format.short-answer': 'Réponse courte', 'reader.empty': 'Cette page ne contient pas encore de texte lisible.', 'reader.done': 'Fait', 'reader.todo': 'À faire', 'library.loading': 'Lecture de vos cerveaux…', 'library.empty': 'Aucun cerveau ici pour le moment. Créez-en un ou importez-en un.', 'manager.loading': 'Lecture de votre bibliothèque locale…', 'manager.empty': 'Aucun cerveau local pour le moment. Créez-en ou importez-en un pour le configurer ici.',
  },
  de: {
    'profile.personal': 'Persönlich', 'profile.research': 'Recherche', 'profile.reading': 'Lesebegleitung', 'profile.business': 'Geschäftsakte', 'profile.planning': 'Planung', 'profile.course': 'Kurs und Lernen', 'profile.blank': 'Leer / individuell',
    'tool.personal-review': 'Reflexion', 'tool.evidence-map': 'Evidenzkarte', 'tool.reading-threads': 'Handlungsfäden', 'tool.decision-brief': 'Entscheidungsnotiz', 'tool.options-review': 'Optionsprüfung', 'tool.flashcards': 'Lernkarten', 'tool.practice-exam': 'Übungsprüfung',
    'profile.field': 'Gehirnprofil', 'profile.modules': '{{count}} Module', 'profile.detail': 'Wähle den Arbeitsmodus, der zu diesem Gehirn passt.', 'tool.detail': 'Erstelle belegte Arbeit aus dem geöffneten Gehirn.', 'tool.other': 'Weitere Werkzeuge · {{count}}', 'tool.otherCopy': 'Nutze jedes Werkzeug mit diesem Gehirn. Eva arbeitet nur aus dem geöffneten Gehirn.', 'tool.focus': 'Themen oder Fokus', 'tool.focusPlaceholder': 'Leer lassen, um das ganze Gehirn zu verwenden.', 'tool.format': 'Prüfungsformat', 'tool.questions': 'Fragen', 'tool.run': '{{tool}} ausführen', 'tool.result': 'Ergebnis', 'tool.primary': 'Hauptwerkzeug für dieses Gehirn', 'tool.crossProfile': 'Aus dem Profil {{profile}} · nutzt dieses offene Gehirn', 'tool.none': 'Für dieses Ergebnis wurden keine unterstützenden Seiten zurückgegeben.', 'format.mixed': 'Gemischt', 'format.multiple-choice': 'Multiple Choice', 'format.written': 'Schriftliche Antworten', 'format.short-answer': 'Kurzantwort', 'reader.empty': 'Diese Seite hat noch keinen lesbaren Inhalt.', 'reader.done': 'Erledigt', 'reader.todo': 'Zu tun', 'library.loading': 'Deine Gehirne werden gelesen…', 'library.empty': 'Hier gibt es noch keine Gehirne. Erstelle oder importiere eines.', 'manager.loading': 'Deine lokale Bibliothek wird gelesen…', 'manager.empty': 'Noch keine lokalen Gehirne. Erstelle oder importiere eines, um es hier zu konfigurieren.',
  },
  it: {
    'profile.personal': 'Personale', 'profile.research': 'Ricerca', 'profile.reading': 'Compagno di lettura', 'profile.business': 'Registro aziendale', 'profile.planning': 'Pianificazione', 'profile.course': 'Corso e apprendimento', 'profile.blank': 'Vuoto / personalizzato',
    'tool.personal-review': 'Riflessione', 'tool.evidence-map': 'Mappa delle evidenze', 'tool.reading-threads': 'Mappa delle trame', 'tool.decision-brief': 'Sintesi decisionale', 'tool.options-review': 'Revisione delle opzioni', 'tool.flashcards': 'Flashcard', 'tool.practice-exam': 'Esame di prova',
    'profile.field': 'Profilo del cervello', 'profile.modules': '{{count}} moduli', 'profile.detail': 'Scegli la modalità di lavoro più adatta a questo cervello.', 'tool.detail': 'Crea lavoro con citazioni dal cervello aperto.', 'tool.other': 'Altri strumenti · {{count}}', 'tool.otherCopy': 'Usa qualsiasi strumento con questo cervello. Eva lavora solo dal cervello aperto.', 'tool.focus': 'Argomenti o focus', 'tool.focusPlaceholder': 'Lascia vuoto per usare tutto il cervello.', 'tool.format': 'Formato dell’esame', 'tool.questions': 'Domande', 'tool.run': 'Esegui {{tool}}', 'tool.result': 'Risultato', 'tool.primary': 'Strumento principale di questo cervello', 'tool.crossProfile': 'Dal profilo {{profile}} · usa questo cervello aperto', 'tool.none': 'Non sono state restituite pagine di supporto per questo risultato.', 'reader.empty': 'Questa pagina non ha ancora contenuto leggibile.', 'reader.done': 'Fatto', 'reader.todo': 'Da fare', 'library.loading': 'Lettura dei tuoi cervelli…', 'library.empty': 'Non ci sono ancora cervelli qui. Creane o importane uno.', 'manager.loading': 'Lettura della tua libreria locale…', 'manager.empty': 'Non ci sono ancora cervelli locali. Creane o importane uno per configurarlo qui.',
  },
  ja: {
    'profile.personal': '個人', 'profile.research': 'リサーチ', 'profile.reading': '読書の案内', 'profile.business': '業務記録', 'profile.planning': '計画', 'profile.course': '学習', 'profile.blank': '空白 / カスタム',
    'tool.personal-review': '振り返り', 'tool.evidence-map': '根拠マップ', 'tool.reading-threads': '筋書きマップ', 'tool.decision-brief': '意思決定ブリーフ', 'tool.options-review': '選択肢レビュー', 'tool.flashcards': 'フラッシュカード', 'tool.practice-exam': '練習試験',
    'profile.field': 'ブレインプロファイル', 'profile.modules': '{{count}} モジュール', 'profile.detail': 'このブレインに最も合う作業モードを選びます。', 'tool.detail': '開いているブレインから引用付きの作業を作成します。', 'tool.other': 'ほかのツール · {{count}}', 'tool.otherCopy': 'このブレインで任意のツールを使えます。Eva は開いているブレインだけを使います。', 'tool.focus': 'トピックまたは焦点', 'tool.focusPlaceholder': 'ブレイン全体を使う場合は空欄にします。', 'tool.format': '試験形式', 'tool.questions': '問題', 'tool.run': '{{tool}} を実行', 'tool.result': '結果', 'tool.primary': 'このブレインの主要ツール', 'tool.crossProfile': '{{profile}} プロファイルのツール · このブレインを使用', 'tool.none': 'この結果を支えるページは返されませんでした。', 'reader.empty': 'このページにはまだ読める本文がありません。', 'reader.done': '完了', 'reader.todo': '未完了', 'library.loading': 'ブレインを読み込んでいます…', 'library.empty': 'まだブレインがありません。作成またはインポートしてください。', 'manager.loading': 'ローカルライブラリを読み込んでいます…', 'manager.empty': 'ローカルのブレインがありません。ここで設定するには作成またはインポートしてください。',
  },
  ko: {
    'profile.personal': '개인', 'profile.research': '연구', 'profile.reading': '독서 도우미', 'profile.business': '업무 기록', 'profile.planning': '계획', 'profile.course': '학습', 'profile.blank': '빈 사용자 설정',
    'tool.personal-review': '성찰', 'tool.evidence-map': '근거 지도', 'tool.reading-threads': '줄거리 지도', 'tool.decision-brief': '의사결정 요약', 'tool.options-review': '선택지 검토', 'tool.flashcards': '플래시카드', 'tool.practice-exam': '연습 시험',
    'profile.field': '브레인 프로필', 'profile.modules': '{{count}}개 모듈', 'profile.detail': '이 브레인에 가장 알맞은 작업 모드를 선택하세요.', 'tool.detail': '열려 있는 브레인에서 인용된 작업을 만듭니다.', 'tool.other': '다른 도구 · {{count}}', 'tool.otherCopy': '이 브레인에서 모든 도구를 사용할 수 있습니다. Eva는 열려 있는 브레인만 사용합니다.', 'tool.focus': '주제 또는 초점', 'tool.focusPlaceholder': '전체 브레인을 사용하려면 비워 두세요.', 'tool.format': '시험 형식', 'tool.questions': '문항', 'tool.run': '{{tool}} 실행', 'tool.result': '결과', 'tool.primary': '이 브레인의 주요 도구', 'tool.crossProfile': '{{profile}} 프로필의 도구 · 이 열린 브레인 사용', 'tool.none': '이 결과를 뒷받침하는 페이지가 반환되지 않았습니다.', 'reader.empty': '이 페이지에는 아직 읽을 수 있는 내용이 없습니다.', 'reader.done': '완료', 'reader.todo': '할 일', 'library.loading': '브레인을 읽는 중…', 'library.empty': '아직 브레인이 없습니다. 만들거나 가져오세요.', 'manager.loading': '로컬 라이브러리를 읽는 중…', 'manager.empty': '아직 로컬 브레인이 없습니다. 여기에서 설정하려면 만들거나 가져오세요.',
  },
  'zh-Hans': {
    'profile.personal': '个人', 'profile.research': '研究', 'profile.reading': '阅读伙伴', 'profile.business': '业务记录', 'profile.planning': '规划', 'profile.course': '课程与学习', 'profile.blank': '空白 / 自定义',
    'tool.personal-review': '反思', 'tool.evidence-map': '证据图谱', 'tool.reading-threads': '线索图谱', 'tool.decision-brief': '决策简报', 'tool.options-review': '选项审查', 'tool.flashcards': '闪卡', 'tool.practice-exam': '练习考试',
    'profile.field': '大脑配置', 'profile.modules': '{{count}} 个模块', 'profile.detail': '选择最适合此大脑的工作模式。', 'tool.detail': '从当前打开的大脑创建带引用的工作成果。', 'tool.other': '其他工具 · {{count}}', 'tool.otherCopy': '可在此大脑中使用任何工具。Eva 只使用当前打开的大脑。', 'tool.focus': '主题或重点', 'tool.focusPlaceholder': '留空即可使用整个大脑。', 'tool.format': '考试形式', 'tool.questions': '题目', 'tool.run': '运行 {{tool}}', 'tool.result': '结果', 'tool.primary': '此大脑的主要工具', 'tool.crossProfile': '来自 {{profile}} 配置 · 使用当前打开的大脑', 'tool.none': '没有返回支持此结果的大脑页面。', 'reader.empty': '此页面还没有可读内容。', 'reader.done': '已完成', 'reader.todo': '待办', 'library.loading': '正在读取你的大脑…', 'library.empty': '这里还没有大脑。请创建或导入一个。', 'manager.loading': '正在读取你的本地资料库…', 'manager.empty': '还没有本地大脑。请创建或导入一个以在这里配置。',
  },
  'zh-Hant': {
    'profile.personal': '個人', 'profile.research': '研究', 'profile.reading': '閱讀夥伴', 'profile.business': '業務記錄', 'profile.planning': '規劃', 'profile.course': '課程與學習', 'profile.blank': '空白 / 自訂',
    'tool.personal-review': '反思', 'tool.evidence-map': '證據圖譜', 'tool.reading-threads': '脈絡圖譜', 'tool.decision-brief': '決策簡報', 'tool.options-review': '選項檢視', 'tool.flashcards': '閃卡', 'tool.practice-exam': '練習考試',
    'profile.field': '大腦設定檔', 'profile.modules': '{{count}} 個模組', 'profile.detail': '選擇最適合此大腦的工作模式。', 'tool.detail': '從目前開啟的大腦建立附引用的工作成果。', 'tool.other': '其他工具 · {{count}}', 'tool.otherCopy': '可在此大腦中使用任何工具。Eva 只使用目前開啟的大腦。', 'tool.focus': '主題或焦點', 'tool.focusPlaceholder': '留空即可使用整個大腦。', 'tool.format': '考試形式', 'tool.questions': '題目', 'tool.run': '執行 {{tool}}', 'tool.result': '結果', 'tool.primary': '此大腦的主要工具', 'tool.crossProfile': '來自 {{profile}} 設定檔 · 使用目前開啟的大腦', 'tool.none': '沒有傳回支持此結果的大腦頁面。', 'reader.empty': '此頁面尚無可讀內容。', 'reader.done': '完成', 'reader.todo': '待辦', 'library.loading': '正在讀取你的大腦…', 'library.empty': '這裡還沒有大腦。請建立或匯入一個。', 'manager.loading': '正在讀取你的本機資料庫…', 'manager.empty': '尚無本機大腦。請建立或匯入一個以在這裡設定。',
  },
};

export function ui(key: ChromeKey, values: Record<string, string | number> = {}): string {
  const template = chromeTranslations[activeLocale][key] ?? chrome[key];
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(values[name] ?? ''));
}
