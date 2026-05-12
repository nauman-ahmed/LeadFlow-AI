export type Language = 'en' | 'fr';

export const strings: Record<Language, Record<string, string>> = {
  en: {
    title: 'LeadFlow Assistant',
    open_aria: 'Open chat',
    close_aria: 'Close chat',
    placeholder: 'Type your message…',
    send: 'Send',
    typing: 'Assistant is typing…',
    error_generic: 'Something went wrong. Please retry.',
    powered_by: 'Powered by LeadFlow AI'
  },
  fr: {
    title: 'Assistant LeadFlow',
    open_aria: 'Ouvrir le chat',
    close_aria: 'Fermer le chat',
    placeholder: 'Tapez votre message…',
    send: 'Envoyer',
    typing: "L'assistant écrit…",
    error_generic: "Une erreur s'est produite. Veuillez réessayer.",
    powered_by: 'Propulsé par LeadFlow AI'
  }
};
