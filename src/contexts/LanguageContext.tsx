import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Language = "en" | "es";

const translations = {
  // ─── Navigation & Sidebar ───
  "nav.myJobs": { en: "My Jobs", es: "Mis Trabajos" },
  "nav.checkinHistory": { en: "Check-in History", es: "Historial de Registro" },
  "nav.crewPortal": { en: "Crew Portal", es: "Portal de Equipo" },
  "nav.signOut": { en: "Sign Out", es: "Cerrar Sesión" },

  // ─── Tabs ───
  "tab.jobs": { en: "Jobs", es: "Trabajos" },
  "tab.calendar": { en: "Calendar", es: "Calendario" },
  "tab.map": { en: "Map", es: "Mapa" },
  "tab.profile": { en: "Profile", es: "Perfil" },

  // ─── Greetings ───
  "greeting.morning": { en: "Good morning", es: "Buenos días" },
  "greeting.afternoon": { en: "Good afternoon", es: "Buenas tardes" },
  "greeting.evening": { en: "Good evening", es: "Buenas noches" },
  "greeting.schedule": { en: "Here's your schedule overview", es: "Aquí está tu resumen del día" },

  // ─── Quick Stats ───
  "stats.today": { en: "Today", es: "Hoy" },
  "stats.thisWeek": { en: "This Week", es: "Esta Semana" },
  "stats.earned": { en: "Earned", es: "Ganado" },

  // ─── Check-in / Check-out ───
  "checkin.checkedIn": { en: "Checked in", es: "Registrado" },
  "checkin.since": { en: "Since", es: "Desde" },
  "checkin.progress": { en: "Progress", es: "Progreso" },
  "checkin.checkIn": { en: "Check In", es: "Registrar Entrada" },
  "checkin.checkOut": { en: "Check Out", es: "Registrar Salida" },
  "checkin.gettingLocation": { en: "Getting location…", es: "Obteniendo ubicación…" },
  "checkin.beforePhoto": { en: "Before photo", es: "Foto de antes" },
  "checkin.afterPhoto": { en: "After photo", es: "Foto de después" },
  "checkin.needed": { en: "needed", es: "necesaria" },
  "checkin.uploadPhotos": { en: "Upload photos to check out", es: "Sube fotos para registrar salida" },
  "checkin.onScheduledDate": { en: "Check-in on", es: "Registro el" },

  // ─── Jobs List ───
  "jobs.today": { en: "Today", es: "Hoy" },
  "jobs.tomorrow": { en: "Tomorrow", es: "Mañana" },
  "jobs.thisWeek": { en: "This Week", es: "Esta Semana" },
  "jobs.upcoming": { en: "Upcoming", es: "Próximos" },
  "jobs.noJobs": { en: "No jobs assigned", es: "Sin trabajos asignados" },
  "jobs.allCaughtUp": { en: "All caught up! No upcoming jobs this week.", es: "¡Todo al día! No hay trabajos esta semana." },
  "jobs.viewCalendar": { en: "View all jobs in Calendar tab", es: "Ver todos los trabajos en Calendario" },
  "jobs.completed": { en: "Completed", es: "Completado" },
  "jobs.scheduled": { en: "scheduled", es: "programado" },
  "jobs.inProgress": { en: "in_progress", es: "en progreso" },
  "jobs.noGps": { en: "No GPS — geofencing disabled", es: "Sin GPS — geovalla desactivada" },
  "jobs.photos": { en: "Job Photos", es: "Fotos del Trabajo" },
  "jobs.startingNow": { en: "Starting now", es: "Comienza ahora" },
  "jobs.startsIn": { en: "Starts in", es: "Comienza en" },
  "jobs.job": { en: "job", es: "trabajo" },
  "jobs.jobPlural": { en: "jobs", es: "trabajos" },
  "jobs.directions": { en: "Directions", es: "Direcciones" },

  // ─── Calendar ───
  "calendar.noJobs": { en: "No jobs scheduled", es: "Sin trabajos programados" },

  // ─── Map ───
  "map.noSites": { en: "No job sites to display", es: "Sin sitios de trabajo" },

  // ─── Overtime Dialog ───
  "overtime.title": { en: "Overtime Explanation Required", es: "Se Requiere Explicación de Horas Extra" },
  "overtime.description": { en: "You've worked longer than the expected hours. Please explain why.", es: "Has trabajado más de las horas esperadas. Por favor explica por qué." },
  "overtime.placeholder": { en: "e.g. Client requested additional cleanup…", es: "ej. El cliente solicitó limpieza adicional…" },
  "overtime.submit": { en: "Submit & Check Out", es: "Enviar y Registrar Salida" },

  // ─── Profile ───
  "profile.myInfo": { en: "My Info", es: "Mi Información" },
  "profile.changesSync": { en: "Changes you make here will also update your employer's records.", es: "Los cambios que hagas aquí también actualizarán los registros de tu empleador." },
  "profile.firstName": { en: "First Name", es: "Nombre" },
  "profile.lastName": { en: "Last Name", es: "Apellido" },
  "profile.streetAddress": { en: "Street Address", es: "Dirección" },
  "profile.city": { en: "City", es: "Ciudad" },
  "profile.state": { en: "State", es: "Estado" },
  "profile.zip": { en: "ZIP", es: "Código Postal" },
  "profile.ssnLast4": { en: "SSN (last 4 only)", es: "SSN (últimos 4)" },
  "profile.onlyLast4": { en: "Only last 4 digits stored", es: "Solo se guardan los últimos 4 dígitos" },
  "profile.saveProfile": { en: "Save Profile", es: "Guardar Perfil" },
  "profile.saving": { en: "Saving…", es: "Guardando…" },
  "profile.saved": { en: "Profile saved & synced", es: "Perfil guardado y sincronizado" },
  "profile.saveFailed": { en: "Failed to save profile", es: "Error al guardar perfil" },
  "profile.language": { en: "Language", es: "Idioma" },
  "profile.setPassword": { en: "Set Password", es: "Establecer Contraseña" },
  "profile.deleteAccount": { en: "Delete Account", es: "Eliminar Cuenta" },
  "profile.linkBusiness": { en: "Link to Business", es: "Vincular a Negocio" },

  // ─── Loading ───
  "loading": { en: "Loading…", es: "Cargando…" },
  "loading.jobs": { en: "Loading jobs…", es: "Cargando trabajos…" },

  // ─── Day names ───
  "day.sunday": { en: "Sunday", es: "Domingo" },
  "day.monday": { en: "Monday", es: "Lunes" },
  "day.tuesday": { en: "Tuesday", es: "Martes" },
  "day.wednesday": { en: "Wednesday", es: "Miércoles" },
  "day.thursday": { en: "Thursday", es: "Jueves" },
  "day.friday": { en: "Friday", es: "Viernes" },
  "day.saturday": { en: "Saturday", es: "Sábado" },

  // ─── Errors ───
  "error.checkInDate": { en: "You can only check in on the scheduled date for this job.", es: "Solo puedes registrarte en la fecha programada para este trabajo." },
  "error.tooFar": { en: "away. Must be within", es: "de distancia. Debes estar dentro de" },
  "error.gps": { en: "Failed to get GPS location", es: "No se pudo obtener la ubicación GPS" },
  "error.photos": { en: "Please upload both before and after photos before checking out.", es: "Por favor sube fotos de antes y después para registrar salida." },
  "error.overtime": { en: "Please provide an explanation for the overtime.", es: "Por favor proporciona una explicación para las horas extra." },
} as const;

type TranslationKey = keyof typeof translations;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey) => string;
  loading: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  language: "en",
  setLanguage: async () => {},
  t: (key) => key,
  loading: true,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<Language>("en");
  const [loading, setLoading] = useState(true);

  // Load language preference from profile
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    (async () => {
      const { data } = await (supabase as any)
        .from("profiles")
        .select("preferred_language")
        .eq("user_id", user.id)
        .single();
      if (data?.preferred_language) {
        setLanguageState(data.preferred_language as Language);
      }
      setLoading(false);
    })();
  }, [user]);

  const setLanguage = useCallback(async (lang: Language) => {
    setLanguageState(lang);
    if (user) {
      await (supabase as any)
        .from("profiles")
        .update({ preferred_language: lang })
        .eq("user_id", user.id);
    }
  }, [user]);

  const t = useCallback((key: TranslationKey): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[language] || entry.en;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, loading }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLanguage = () => useContext(LanguageContext);
