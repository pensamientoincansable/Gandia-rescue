import React, { useState } from 'react';
import { MessageSquare, Check, X, Sparkles, MapPin, BookOpen, Compass } from 'lucide-react';

/**
 * Modal de diálogo con los lugareños de Gandía.
 * Permite conversar sobre la historia del lugar, la biodiversidad local
 * y recibir pistas clave para encontrar y rescatar a los animales.
 */

const NPC_DIALOGUES = {
  vicent: {
    greet: '¡Hola, equipo de rescate! Bienvenidos a la Platja Nord de Gandía. Aquí el Mediterráneo se junta con el cordón de dunas protegidas.',
    topics: [
      {
        id: 'historia',
        title: 'Historia de la Playa y el cordón dunar',
        text: 'Nuestra playa cuenta con más de 3 km de arena fina y uno de los pocos sistemas dunares regenerados del golfo de Valencia. En el paraje del Auir conviven el chorlitejo patinegro y especies como el erizo europeo entre la vegetación de borró.',
      },
      {
        id: 'tortugas',
        title: 'Nidos de tortuga boba (Caretta caretta)',
        text: 'En los últimos veranos hemos tenido varios desoves históricos de tortuga marina en la costa de Gandía. Mantenemos patrullas nocturnas constantes para asegurar que los nidos no sufran perturbaciones de luz artificial.',
      },
      {
        id: 'pista',
        title: '¿Has visto algún animal herido?',
        text: '¡Sí! Justo hace un momento vi a un pequeño erizo atrapado cerca de las maderas de la pasarela, hacia el sector norte. Parecía tener una pequeña herida en la pata. Id con cuidado para no asustarlo.',
      },
    ],
  },
  manolo: {
    greet: '¡Bones! Soy Manolo, patrón del Grau de Gandía de toda la vida. Por aquí el olor a salitre y las gaviotas nunca descansan.',
    topics: [
      {
        id: 'historia',
        title: 'Historia del Grau y la Lonja de Gandía',
        text: 'El puerto de Gandía nació a finales del siglo XIX para exportar los cítricos de la Safor en tren directo hasta Alcoy y el mar. Hoy nuestra lonja de pescado es famosa en toda la Comunidad por las gambas y el pescado fresco de barca.',
      },
      {
        id: 'pesca',
        title: 'Aves marinas y artes tradicionales',
        text: 'Nuestras barcas de arrastre y trasmallo conviven a diario con las gaviotas patiamarillas y los cormoranes. Siempre intentamos recoger los restos de redes para proteger a la fauna marina.',
      },
      {
        id: 'pista',
        title: '¿Algún aviso de fauna en el puerto?',
        text: 'Cerca del muelle del faro rojo vi a una gaviota patiamarilla enganchada con un sedal de pesca suelto. Está posada en el borde del muelle. Si le quitáis el hilo y desinfectáis la herida se recuperará en un vuelo.',
      },
    ],
  },
  sento: {
    greet: '¡Hombre, la gente de Natura! Benvinguts a la Marjal de Gandía. Este humedal es el pulmón verde y la joya del agua dulce de La Safor.',
    topics: [
      {
        id: 'historia',
        title: 'El origen de los Ullals y el agua subterránea',
        text: 'La Marjal se nutre de los "Ullals", manantiales de agua dulce cristalina que brotan de los acuíferos kársticos de las montañas cercanas. El Ullal de l’Estany y el de la Mare de Déu dan vida a especies únicas como el samaruc.',
      },
      {
        id: 'arroz',
        title: 'El cultivo tradicional del arroz',
        text: 'Generaciones enteras de familias de Gandía y Tavernes han cultivado estas parcelas. La inundación estacional de los arrozales crea un refugio indispensable para garzas reales y aves migratorias.',
      },
      {
        id: 'pista',
        title: '¿Dónde está el animal que necesita ayuda?',
        text: 'Un jabalí joven bajó anoche buscando agua y se ha quedado medio atascado entre los carrizales espesos junto al canal. El calor lo tiene agotado; una buena dosis de agua fresca es lo primero que necesitará.',
      },
    ],
  },
  carmen: {
    greet: '¡Hola, compañeros! Estoy muestreando la calidad del agua del Riu Serpis. Es el corredor ecológico más vital entre el interior montañoso y el mar.',
    topics: [
      {
        id: 'historia',
        title: 'El curso del Serpis y su bosque de ribera',
        text: 'El Serpis nace en Alcoy y desemboca en el Grau de Gandía. En sus márgenes encontramos álamos blancos, sauces y adelfas que dan sombra y refugio a nutrias, conejos y aves ribereñas.',
      },
      {
        id: 'biodiversidad',
        title: 'Especies protegidas del río',
        text: 'Aquí habitan el barbo mediterráneo y la madrilla. Además, las riberas sirven de corredor biológico natural para multitud de pequeños mamíferos.',
      },
      {
        id: 'pista',
        title: '¿Has detectado algún aviso?',
        text: 'He visto rastros de un conejo europeo que cojea cerca de la arboleda del puente. Parece que ha sufrido una herida en la pata. Con una cura rápida y desinfección saldrá adelante enseguida.',
      },
    ],
  },
  francesc: {
    greet: '¡Saludos cordiales! Bienvenidos a la Gandía histórica, cuna de los duques Borja y tierra del poeta Ausiàs March.',
    topics: [
      {
        id: 'historia',
        title: 'La dinastía de los Borja y el Palacio Ducal',
        text: 'Aquí floreció uno de los ducados más influyentes del Renacimiento europeo. En el Palacio Ducal nació San Francisco de Borja, y la Colegiata de Santa María preside nuestra plaza desde el siglo XIV.',
      },
      {
        id: 'cultura',
        title: 'El Siglo de Oro valenciano',
        text: 'Gandía es la capital literaria de las letras valencianas: aquí crearon Ausiàs March, Joanot Martorell con su Tirant lo Blanch y Roís de Corella. Una herencia cultural viva.',
      },
      {
        id: 'pista',
        title: '¿Ha visto al animal en apuros?',
        text: 'En los arcos de piedra que dan al callejón histórico se ha refugiado uno de los gatos de la colonia comunitaria. Con este calor sofocante necesita urgentemente agua fresca y un chequeo preventivo.',
      },
    ],
  },
  neus: {
    greet: '¡Hola, agentes de rescate! Estamos a más de 800 metros en la cumbre del Montdúver. La vista abarca desde Valencia hasta el cabo de San Antonio.',
    topics: [
      {
        id: 'historia',
        title: 'Geología y flora del macizo del Montdúver',
        text: 'El Montdúver es un imponente macizo calizo modelado por dolinas y simas kársticas. En sus laderas crecen el pino carrasco y endémicas plantas medicinales como el romero y el tomillo.',
      },
      {
        id: 'rapaces',
        title: 'Aves rapaces y fauna de cumbre',
        text: 'En estas peñas anidan el águila perdicera, el halcón peregrino y rapaces nocturnas como el mochuelo europeo y el búho real, que controlan de forma natural las poblaciones de roedores.',
      },
      {
        id: 'pista',
        title: '¿Dónde está el aviso de fauna?',
        text: 'Tras la fuerte tormenta de viento de ayer, hay un mochuelo joven aturdido en las ramas bajas de un pino en el sendero. Lo ideal es observarlo tranquilamente con paciencia para no estresarlo.',
      },
    ],
  },
};

export default function DialogueModal({ npcData, onClose, onRewardXp }) {
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [visitedTopics, setVisitedTopics] = useState(new Set());

  const info = NPC_DIALOGUES[npcData.id] || NPC_DIALOGUES.vicent;

  const handleSelectTopic = (topic) => {
    setSelectedTopic(topic);
    if (!visitedTopics.has(topic.id)) {
      setVisitedTopics(new Set([...visitedTopics, topic.id]));
      onRewardXp?.(10); // +10 XP por descubrir historia local
    }
  };

  return (
    <div className="modal-layer modal-layer--dialogue" onMouseDown={onClose}>
      <div className="dialogue-box glass-panel" onMouseDown={(e) => e.stopPropagation()}>
        <header className="dialogue-box__header">
          <div className="npc-identity">
            <span className="npc-avatar">{npcData.icon || '👤'}</span>
            <div>
              <h3>{npcData.name}</h3>
              <small>{npcData.role}</small>
            </div>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Cerrar"><X size={18} /></button>
        </header>

        <div className="dialogue-box__content">
          <div className="dialogue-bubble">
            <p>{selectedTopic ? selectedTopic.text : info.greet}</p>
          </div>

          <div className="dialogue-topics">
            <span className="topics-label"><BookOpen size={14} /> Temas de conversación e historia:</span>
            <div className="topics-list">
              {info.topics.map((t) => {
                const isVisited = visitedTopics.has(t.id);
                const isCurrent = selectedTopic?.id === t.id;
                return (
                  <button
                    key={t.id}
                    className={`topic-btn ${isCurrent ? 'is-current' : ''} ${isVisited ? 'is-visited' : ''}`}
                    onClick={() => handleSelectTopic(t)}
                  >
                    <span>{t.title}</span>
                    {isVisited && <Check size={14} />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <footer className="dialogue-box__footer">
          <button className="modal-primary" onClick={onClose}>
            <Check size={16} /> Continuar misión
          </button>
        </footer>
      </div>
    </div>
  );
}
