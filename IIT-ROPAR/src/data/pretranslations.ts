export interface TranslationItem {
  question: string;
  answer: string;
  tags: string[];
}

export const PRETRANSLATED_FAQS: Record<string, Record<string, TranslationItem>> = {
  "FAQ-001": {
    hi: {
      question: "IIT रोपड़ में विचारणशाला इंटर्नशिप कार्यक्रम क्या है?",
      answer: "IIT रोपड़ में विचारणशाला लैब द्वारा विचारणशाला इंटर्नशिप एक प्रतिष्ठित व्यावहारिक अनुसंधान और सिस्टम इंजीनियरिंग इंटर्नशिप कार्यक्रम है। इंटर्न अत्याधुनिक प्रणालियों, क्लाउड इंफ्रास्ट्रक्चर, एआई मॉडल और वास्तविक दुनिया के सॉफ्टवेयर उत्पादों पर काम करते हैं। यह सहकर्मी से सहकर्मी शिक्षण, मॉड्यूलर सॉफ्टवेयर डिज़ाइन और कठोर इंजीनियरिंग प्रथाओं पर जोर देता है, जिससे छात्रों को टियर -1 तकनीकी कंपनियों और शीर्ष स्तर के अनुसंधान संस्थानों के लिए तैयार किया जा सके।",
      tags: ["अवलोकन", "विचारणशाला", "IIT रोपड़", "अनुसंधान"]
    },
    pa: {
      question: "IIT ਰੋਪੜ ਵਿਖੇ ਵਿਚਾਰਣਸ਼ਾਲਾ ਇੰਟਰਨਸ਼ਿਪ ਪ੍ਰੋਗਰਾਮ ਕੀ ਹੈ?",
      answer: "IIT ਰੋਪੜ ਵਿਖੇ ਵਿਚਾਰਣਸ਼ਾਲਾ ਲੈਬ ਦੁਆਰਾ ਵਿਚਾਰਣਸ਼ਾਲਾ ਇੰਟਰਨਸ਼ਿਪ ਇੱਕ ਪ੍ਰਤਿਸ਼ਠਿਤ ਪ੍ਰਯੋਗਾਤਮਕ ਖੋਜ ਅਤੇ ਸਿਸਟਮ ਇੰਜੀਨੀਅਰਿੰਗ ਇੰਟਰਨਸ਼ਿਪ ਪ੍ਰੋਗਰਾਮ ਹੈ। ਇੰਟਰਨ ਆਧੁਨਿਕ ਪ੍ਰਣਾਲੀਆਂ, ਕਲਾਉਡ ਬੁਨਿਆਦੀ ਢਾਂਚੇ, ਏਆਈ ਮਾਡਲਾਂ, ਅਤੇ ਅਸਲ-ਸੰਸਾਰ ਸਾਫਟਵੇਅਰ ਉਤਪਾਦਾਂ 'ਤੇ ਕੰਮ ਕਰਦੇ ਹਨ। ਇਹ ਪੀਅਰ-ਟੂ-ਪੀਅਰ ਸਿੱਖਣ, ਮਾਡਯੂਲਰ ਸਾਫਟਵੇਅਰ ਡਿਜ਼ਾਈਨ, ਅਤੇ ਸਖ਼ਤ ਇੰਜੀਨੀਅਰਿੰਗ ਅਭਿਆਸਾਂ 'ਤੇ ਜ਼ੋਰ ਦਿੰਦਾ ਹੈ, ਜੋ ਕਿ ਵਿਦਿਆਰਥੀਆਂ ਨੂੰ ਚੋਟੀ ਦੀਆਂ ਤਕਨੀਕੀ ਕੰਪਨੀਆਂ ਅਤੇ ਖੋਜ ਸੰਸਥਾਵਾਂ ਲਈ ਤਿਆਰ ਕਰਦਾ ਹੈ।",
      tags: ["ਸੰਖੇਪ", "ਵਿਚਾਰਣਸ਼ਾਲਾ", "IIT ਰੋਪੜ", "ਖੋਜ"]
    },
    es: {
      question: "¿Qué es el Programa de Pasantías Vicharanashala en IIT Ropar?",
      answer: "La pasantía Vicharanashala de Vicharanashala Lab en IIT Ropar es un prestigioso programa de investigación práctica e ingeniería de sistemas. Los pasantes trabajan en sistemas de vanguardia, infraestructura en la nube, modelos de IA y productos de software del mundo real. Enfatiza el aprendizaje entre pares, el diseño de software modular y las prácticas rigurosas de ingeniería, preparando a los estudiantes para empresas tecnológicas de nivel 1 e instituciones de investigación de primer nivel.",
      tags: ["Descripción", "Vicharanashala", "IIT Ropar", "Investigación"]
    }
  },
  "FAQ-002": {
    hi: {
      question: "क्या विचारणशाला इंटर्नशिप सशुल्क है (क्या हमें वजीफा मिलता है)?",
      answer: "हाँ। यह इंटर्नशिप चयनित पूर्णकालिक ऑन-कैंपस या रिमोट-संरेखित इंटर्न के लिए मासिक वजीफा प्रदान करती है, जो संतोषजनक प्रदर्शन और साप्ताहिक रोसेटा जर्नल लॉग और मील का पत्थर समीक्षाओं के पूरा होने के अधीन है। वजीफा अगले महीने के पहले सप्ताह के आसपास टीम सबमिशन के सत्यापन के बाद जारी किया जाता है।",
      tags: ["वजीफा", "भुगतान", "नीति"]
    },
    pa: {
      question: "ਕੀ ਵਿਚਾਰਣਸ਼ਾਲਾ ਇੰਟਰਨਸ਼ਿਪ ਅਦਾਇਗੀਸ਼ੁਦਾ ਹੈ (ਕੀ ਸਾਨੂੰ ਵਜ਼ੀਫ਼ਾ ਮਿਲਦਾ ਹੈ)?",
      answer: "ਹਾਂ। ਇਹ ਇੰਟਰਨਸ਼ਿਪ ਚੁਣੇ ਗਏ ਪੂਰੇ ਸਮੇਂ ਦੇ ਆਨ-ਕੈਂਪਸ ਜਾਂ ਰਿਮੋਟ-ਅਲਾਈਨਡ ਇੰਟਰਨਾਂ ਲਈ ਮਹੀਨਾਵਾਰ ਵਜ਼ੀਫ਼ਾ ਪ੍ਰਦਾਨ ਕਰਦੀ ਹੈ, ਜੋ ਕਿ ਤਸੱਲੀਬਖਸ਼ ਪ੍ਰਦਰਸ਼ਨ ਅਤੇ ਹਫਤਾਵਾਰੀ ਰੋਸੇਟਾ ਜਰਨਲ ਲੌਗਸ ਅਤੇ ਮੀਲ ਪੱਥਰ ਸਮੀਖਿਆਵਾਂ ਦੇ ਪੂਰਾ ਹੋਣ ਦੇ ਅਧੀਨ ਹੈ। ਵਜ਼ੀਫ਼ਾ ਅਗਲੇ ਮਹੀਨੇ ਦੇ ਪਹਿਲੇ ਹਫ਼ਤੇ ਦੇ ਆਸ-ਪਾਸ ਟੀਮ ਸਪੁਰਦਗੀ ਦੀ ਪੁਸ਼ਟੀ ਕਰਨ ਤੋਂ ਬਾਅਦ ਜਾਰी ਕੀਤਾ ਜਾਂਦਾ ਹੈ।",
      tags: ["ਵਜ਼ੀਫ਼ਾ", "ਭੁਗਤਾਨ", "ਨੀਤੀ"]
    },
    es: {
      question: "¿La pasantía de Vicharanashala es paga (recibimos un estipendio)?",
      answer: "Sí. La pasantía ofrece un estipendio mensual para pasantes seleccionados a tiempo completo en el campus o alineados de forma remota, sujeto a un rendimiento satisfactorio y a la finalización de los registros semanales del Rosetta Journal y las revisiones de hitos. Los estipendios se liberan después de la verificación de las presentaciones del equipo alrededor de la primera semana del mes siguiente.",
      tags: ["Estipendio", "Pago", "Política"]
    }
  },
  "FAQ-003": {
    hi: {
      question: "2026 चक्र के शुरू और समाप्त होने की तारीखें क्या हैं?",
      answer: "विचारणशाला समर 2026 चक्र आधिकारिक तौर पर 1 जून, 2026 से शुरू होता है और 10 सप्ताह तक चलता है, जो 10 अगस्त, 2026 को समाप्त होता है। हालांकि, अलग-अलग विश्वविद्यालय शेड्यूल वाले छात्र ViBe पोर्टल के माध्यम से अपने सौंपे गए आकाओं (mentors) के साथ समन्वय करके एक संशोधित ट्रैक (न्यूनतम 8-सप्ताह की अवधि) का समन्वय कर सकते हैं।",
      tags: ["अनुसूची", "तारीखें", "समयरेखा"]
    },
    pa: {
      question: "2026 ਚੱਕਰ ਦੇ ਸ਼ੁਰੂ ਅਤੇ ਸਮਾਪਤੀ ਦੀਆਂ ਤਾਰੀਖਾਂ ਕੀ ਹਨ?",
      answer: "ਵਿਚਾਰਣਸ਼ਾਲਾ ਸਮਰ 2026 ਚੱਕਰ ਅਧਿਕਾਰਤ ਤੌਰ 'ਤੇ 1 ਜੂਨ, 2026 ਨੂੰ ਸ਼ੁਰੂ ਹੁੰਦਾ ਹੈ ਅਤੇ 10 ਹਫ਼ਤਿਆਂ ਤੱਕ ਚੱਲਦਾ ਹੈ, ਜੋ 10 ਅਗਸਤ, 2026 ਨੂੰ ਖ਼ਤਮ ਹੁੰਦਾ ਹੈ। ਹਾਲਾਂਕਿ, ਵੱਖ-ਵੱਖ ਯੂਨੀਵਰਸਿਟੀ ਸ਼ਡਿਊਲ ਵਾਲੇ ਵਿਦਿਆਰਥੀ ViBe ਪੋਰਟਲ ਰਾਹੀਂ ਆਪਣੇ ਨਿਰਧਾਰਤ ਸਲਾਹਕਾਰਾਂ ਨਾਲ ਤਾਲਮੇਲ ਕਰਕੇ ਇੱਕ ਸੋਧਿਆ ਹੋਇਆ ਟ੍ਰੈਕ (ਘੱਟੋ-ਘੱਟ 8 ਹਫ਼ਤਿਆਂ ਦੀ ਮਿਆਦ) ਤਿਆਰ ਕਰ ਸਕਦੇ ਹਨ।",
      tags: ["ਸ਼ਡਿਊਲ", "ਤਾਰੀਖਾਂ", "ਸਮਾਂ-ਸੀਮਾ"]
    },
    es: {
      question: "¿Cuáles son las fechas de inicio y finalización del ciclo 2026?",
      answer: "El ciclo de verano 2026 de Vicharanashala comienza oficialmente el 1 de junio de 2026 y abarca 10 semanas, finalizando el 10 de agosto de 2026. Sin embargo, los estudiantes con horarios universitarios diferentes pueden coordinar una pista modificada (duración mínima de 8 semanas) a través de sus mentores asignados a través del portal ViBe.",
      tags: ["Calendario", "Fechas", "Cronograma"]
    }
  },
  "FAQ-004": {
    hi: {
      question: "क्या मैं अपनी इंटर्नशिप की तारीखें बदल सकता हूँ या छुट्टियों का अनुरोध कर सकता हूँ?",
      answer: "हाँ, उपयोगकर्ता डैशबोर्ड में 'शैक्षणिक अपवाद' टैब के तहत तारीख समायोजन (प्रारंभ/समाप्त को 2 सप्ताह तक स्थानांतरित करना) का अनुरोध किया जा सकता है। नियोजित छुट्टियों की सूचना कम से कम 72 घंटे पहले सार्वजनिक चैनलों के माध्यम से दी जानी चाहिए। लगातार 4 दिनों से अधिक की किसी भी छुट्टी के लिए मेंटर की मंजूरी की आवश्यकता होती है और इससे आनुपातिक वजीफा काटा जा सकता है।",
      tags: ["छुट्टियाँ", "समयरेखा", "सहायता"]
    },
    pa: {
      question: "ਕੀ ਮੈਂ ਆਪਣੀਆਂ ਇੰਟਰਨਸ਼ਿਪ ਤਾਰੀਖਾਂ ਬਦਲ ਸਕਦਾ ਹਾਂ ਜਾਂ ਛੁੱਟੀਆਂ ਦੀ ਬੇਨਤੀ ਕਰ ਸਕਦਾ ਹਾਂ?",
      answer: "ਹਾਂ, ਯੂਜ਼ਰ ਡੈਸ਼ਬੋਰਡ ਵਿੱਚ 'ਅਕਾਦਮਿਕ ਅਪਵਾਦ' ਟੈਬ ਦੇ ਅਧੀਨ ਤਾਰੀਖਾਂ ਵਿੱਚ ਤਬਦੀਲੀ (ਸ਼ੁਰੂ/ਸਮਾਪਤੀ ਨੂੰ 2 ਹਫ਼ਤਿਆਂ ਤੱਕ ਬਦਲਣਾ) ਦੀ ਬੇਨਤੀ ਕੀਤੀ ਜਾ ਸਕਦੀ ਹੈ। ਯੋਜਨਾਬੱਧ ਛੁੱਟੀਆਂ ਦੀ ਰਿਪੋਰਟ ਜਨਤਕ ਚੈਨਲਾਂ ਰਾਹੀਂ ਘੱਟੋ-ਘੱਟ 72 ਘੰਟੇ ਪਹਿਲਾਂ ਦਿੱਤੀ ਜਾਣੀ ਚਾਹੀਦੀ ਹੈ। ਲਗਾਤਾਰ 4 ਦਿਨਾਂ ਤੋਂ ਵੱਧ ਦੀ ਕਿਸੇ ਵੀ ਛੁੱਟੀ ਲਈ ਮੈਂਟਰ ਦੀ ਮਨਜ਼ੂਰੀ ਦੀ ਲੋੜ ਹੁੰਦੀ ਹੈ ਅਤੇ ਵਜ਼ੀਫ਼ੇ ਵਿੱਚੋਂ ਅਨੁਪਾਤਕ ਕਟੌਤੀ ਕੀਤੀ ਜਾ ਸਕਦੀ ਹੈ।",
      tags: ["ਛੁੱਟੀਆਂ", "ਸਮਾਂ-ਸੀਮਾ", "ਸਹਾਇਤਾ"]
    },
    es: {
      question: "¿Puedo cambiar las fechas de mi pasantía o solicitar permisos de ausencia?",
      answer: "Sí, los ajustes de fecha (adelantar o retrasar el inicio/fin hasta 2 semanas) se pueden solicitar en la pestaña 'Excepciones académicas' en el Panel de usuario. Los permisos planificados deben informarse al menos 72 horas antes a través de los canales públicos. Cualquier ausencia que exceda los 4 días consecutivos requiere la aprobación del mentor y podría deducir montos proporcionales del estipendio.",
      tags: ["Permisos", "Cronograma", "Asistencia"]
    }
  },
  "FAQ-005": {
    hi: {
      question: "मैं अपना एनओसी (अनापत्ति प्रमाण पत्र) कैसे अपलोड करूं और अंतिम तिथि क्या है?",
      answer: "आपके कॉलेज के डीन या ट्रेनिंग एंड प्लेसमेंट ऑफिसर (टीपीओ) द्वारा हस्ताक्षरित अनापत्ति प्रमाण पत्र (एनओसी) को यूजर डैशबोर्ड में 'एनओसी और दस्तावेज' ब्लॉक के तहत अपलोड किया जाना चाहिए। जमा करने की अंतिम तिथि 10 जून, 2026 है। वैध एनओसी अपलोड न करने पर वजीफा प्रसंस्करण और प्रमाण पत्र निर्माण रोक दिया जाएगा।",
      tags: ["एनओसी", "दस्तावेज", "अनुपालन"]
    },
    pa: {
      question: "ਮੈਂ ਆਪਣਾ ਐਨਓਸੀ (ਨੋ ਆਬਜੈਕਸ਼ਨ ਸਰਟੀਫਿਕੇਟ) ਕਿਵੇਂ ਅਪਲੋਡ ਕਰਾਂ ਅਤੇ ਇਸਦੀ ਆਖਰੀ ਮਿਤੀ ਕੀ ਹੈ?",
      answer: "ਤੁਹਾਡੇ ਕਾਲਜ ਦੇ ਡੀਨ ਜਾਂ ਟ੍ਰੇਨਿੰਗ ਐਂਡ ਪਲੇਸਮੈਂਟ ਅਫਸਰ (TPO) ਦੁਆਰਾ ਦਸਤਖਤ ਕੀਤੇ ਨੋ ਆਬਜੈਕਸ਼ਨ ਸਰਟੀਫਿਕੇਟ (NOC) ਨੂੰ ਯੂਜ਼ਰ ਡੈਸ਼ਬੋਰਡ 'ਤੇ 'NOC & Documents' ਬਲਾਕ ਦੇ ਅਧੀਨ ਅਪਲੋड ਕੀਤਾ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ। ਜਮ੍ਹਾ ਕਰਵਾਉਣ ਦੀ ਆਖਰੀ ਮਿਤੀ 10 ਜੂਨ, 2026 ਹੈ। ਵੈਧ ਐਨਓਸੀ ਅਪਲੋਡ ਨਾ ਕਰਨ 'ਤੇ ਵਜ਼ੀਫ਼ਾ ਪ੍ਰਕਿਰਿਆ ਅਤੇ ਸਰਟੀਫਿਕੇਟ ਬਣਾਉਣਾ ਰੋਕ ਦਿੱਤਾ ਜਾਵੇਗਾ।",
      tags: ["NOC", "ਦਸਤਾਵੇਜ਼", "ਪਾਲਣਾ"]
    },
    es: {
      question: "¿Cómo subo mi NOC (Certificado de No Objeción) y cuál es la fecha límite?",
      answer: "Los Certificados de No Objeción (NOC) firmados por el Decano de su universidad o el Oficial de Capacitación y Colocación (TPO) deben subirse a través del Panel de usuario bajo el bloque 'NOC y Documentos'. La fecha límite para la presentación es el 10 de junio de 2026. No subir un NOC válido retendrá el procesamiento del estipendio y la generación del certificado.",
      tags: ["NOC", "Documentos", "Cumplimiento"]
    }
  },
  "FAQ-006": {
    hi: {
      question: "मुझे अपना आधिकारिक इंटर्नशिप ऑफर लेटर कब मिलेगा?",
      answer: "ऑफर लेटर स्वचालित रूप से संकलित किए जाते हैं और उम्मीदवारों को बैचों में जारी किए जाते हैं। एक बार जब आपके शैक्षणिक क्रेडेंशियल और एनओसी अनंतिम रूप से स्वीकृत हो जाते हैं, तो आप डैशबोर्ड से अपना आधिकारिक पत्र डाउनलोड कर सकते हैं। यदि आपको पत्र पर कोई वर्तनी या तथ्यात्मक त्रुटि मिलती है, तो दस्तावेज़ ब्लॉक के भीतर 'त्रुटि सुधार का अनुरोध करें' पर क्लिक करें।",
      tags: ["ऑफर लेटर", "ऑनबोर्डिंग", "सत्यापन"]
    },
    pa: {
      question: "ਮੈਨੂੰ ਆਪਣਾ ਅਧਿਕਾਰਤ ਇੰਟਰਨਸ਼ਿਪ ਆਫਰ ਲੈਟਰ ਕਦੋਂ ਮਿਲੇਗਾ?",
      answer: "ਆਫਰ ਲੈਟਰ ਆਪਣੇ ਆਪ ਤਿਆਰ ਕੀਤੇ ਜਾਂਦੇ ਹਨ ਅਤੇ ਉਮੀਦਵਾਰਾਂ ਨੂੰ ਬੈਚਾਂ ਵਿੱਚ ਜਾਰੀ ਕੀਤੇ ਜਾਂਦੇ ਹਨ। ਇੱਕ ਵਾਰ ਜਦੋਂ ਤੁਹਾਡੇ ਅਕਾਦਮਿਕ ਪ੍ਰਮਾਣ ਪੱਤਰ ਅਤੇ ਐਨਓਸੀ ਨੂੰ ਅਸਥਾਈ ਤੌਰ 'ਤੇ ਮਨਜ਼ੂਰੀ ਮਿਲ ਜਾਂਦੀ ਹੈ, ਤਾਂ ਤੁਸੀਂ ਡੈਸ਼ਬੋਰਡ ਤੋਂ ਆਪਣਾ ਅਧਿਕਾਰਤ ਪੱਤਰ ਡਾਊਨਲੋਡ ਕਰ ਸਕਦੇ ਹੋ। ਜੇਕਰ ਤੁਹਾਨੂੰ ਕੋਈ ਗਲਤੀ ਮਿਲਦੀ ਹੈ, ਤਾਂ ਦਸਤਾਵੇਜ਼ ਬਲਾਕ ਦੇ ਅੰਦਰ 'Request Correction' 'ਤੇ ਕਲਿੱक ਕਰੋ।",
      tags: ["ਆਫਰ ਲੈਟਰ", "ਔਨਬੋਰਡਿੰਗ", "ਤਸਦੀਕ"]
    },
    es: {
      question: "¿Cuándo recibiré mi Carta de Oferta de pasantía oficial?",
      answer: "Las cartas de oferta se compilan e emiten automáticamente a los candidatos en lotes. Una vez que sus credenciales académicas y NOC estén aprobados provisionalmente, puede descargar su carta oficial desde el Panel. Si encuentra errores tipográficos en su carta, haga clic en 'Solicitar corrección' dentro del bloque del documento.",
      tags: ["Carta de Oferta", "Incorporación", "Verificación"]
    }
  },
  "FAQ-007": {
    hi: {
      question: "अंतिम इंटर्नशिप प्रमाण पत्र कैसे और कब जारी किए जाएंगे?",
      answer: "इंटर्नशिप के सफल समापन पर, जिसमें अंतिम परियोजना मूल्यांकन, टीम रिपॉजिटरी विलय और रोसेटा जर्नल हस्ताक्षर शामिल हैं, लैब निदेशक द्वारा हस्ताक्षरित आईआईटी रोपड़ के तहत आधिकारिक डिजिटल प्रमाण पत्र जारी किए जाएंगे। ये आम तौर पर कार्यक्रम बंद होने के 14 दिनों के भीतर (24 अगस्त, 2026 तक) डाउनलोड के लिए उपलब्ध होते हैं। अपने यूजर डैशबोर्ड के तहत प्रगति की जांच करें।",
      tags: ["प्रमाण पत्र", "स्नातक", "सत्यापन"]
    },
    pa: {
      question: "ਆਖਰੀ ਇੰਟਰਨਸ਼ਿਪ ਸਰਟੀਫਿਕੇਟ ਕਿਸ ਤਰ੍ਹਾਂ ਅਤੇ ਕਦੋਂ ਜਾਰੀ ਕੀਤੇ ਜਾਣਗੇ?",
      answer: "ਇੰਟਰਨਸ਼ਿਪ ਦੇ ਸਫਲਤਾਪੂਰਵਕ ਪੂਰਾ ਹੋਣ 'ਤੇ, ਜਿਸ ਵਿੱਚ ਅੰਤਿਮ ਪ੍ਰੋਜੈਕਟ ਮੁਲਾਂਕਣ, ਟੀਮ ਰਿਪੋਜ਼ਟਰੀ ਮਰਜਰ ਅਤੇ ਰੋਸੇਟਾ ਜਰਨਲ ਦੇ ਹਸਤਾਖਰ ਸ਼ਾਮਲ ਹਨ, ਲੈਬ ਡਾਇਰੈਕਟਰ ਦੁਆਰਾ ਦਸਤਖਤ ਕੀਤੇ ਗਏ IIT ਰੋਪੜ ਦੇ ਅਧੀਨ ਅਧਿਕਾਰਤ ਡਿਜੀਟਲ ਸਰਟੀਫਿਕੇਟ ਜਾਰੀ ਕੀਤੇ ਜਾਣਗੇ। ਇਹ ਆਮ ਤੌਰ 'ਤੇ ਪ੍ਰੋਗਰਾਮ ਦੇ ਬੰਦ ਹੋਣ ਦੇ 14 ਦਿਨਾਂ ਦੇ ਅੰਦਰ (24 ਅਗਸਤ, 2026 ਤੱਕ) ਡਾਊਨਲੋਡ ਕਰਨ ਲਈ ਉਪਲਬਧ ਹੁੰਦੇ ਹਨ। ਆਪਣੇ ਯੂਜ਼ਰ ਡੈਸ਼ਬੋਰਡ ਵਿੱਚ ਪ੍ਰਗਤੀ ਦੀ ਜਾਂਚ ਕਰੋ।",
      tags: ["ਸਰਟੀਫਿਕੇਟ", "ਗ੍ਰੈਜੂਏਸ਼ਨ", "ਤਸਦੀਕ"]
    },
    es: {
      question: "¿Cómo y cuándo se emitirán los Certificados de Pasantía finales?",
      answer: "Tras la finalización exitosa de la pasantía, incluida la evaluación del proyecto final, las fusiones de repositorios del equipo y las firmas del Rosetta Journal, se emitirán certificados digitales oficiales bajo el IIT Ropar, firmados por el director del laboratorio. Por lo general, están disponibles para descargar dentro de los 14 días posteriores al cierre del programa (antes del 24 de agosto de 2026). Verifique el progreso en su Panel de usuario.",
      tags: ["Certificado", "Graduación", "Validación"]
    }
  },
  "FAQ-008": {
    hi: {
      question: "मेरा मेंटर कौन होगा और यदि अभी तक मेरा मेंटर आवंटित नहीं हुआ है तो क्या करें?",
      answer: "मेंटरों में IIT रोपड़ के पीएचडी विद्वान, प्रमुख शोधकर्ता और वरिष्ठ इंजीनियर शामिल हैं। मेंटरों को चयन के दौरान आपके द्वारा निर्दिष्ट डोमेन प्राथमिकताओं (जैसे, क्लाउड, एआई, फ्रंटएंड, सिस्टम) के आधार पर मिलान किया जाता है। यदि 30 मई तक आपके डैशबोर्ड पर कोई मेंटर दिखाई नहीं देता है, तो अलर्ट पोस्ट करने के लिए यक्ष चैट का उपयोग करें, या स्लैक पर `#mentorship-matching` चैनल में पिंग करें।",
      tags: ["परामर्श", "सहायता", "स्लैक"]
    },
    pa: {
      question: "ਮੇਰਾ ਸਲਾਹਕਾਰ ਕੌਣ ਹੋਵੇਗਾ ਅਤੇ ਜੇਕਰ ਅਜੇ ਤੱਕ ਮੇਰਾ ਸਲਾਹਕਾਰ ਨਿਰਧਾਰਤ ਨਹੀਂ ਹੋਇਆ ਤਾਂ ਕੀ ਕਰੀਏ?",
      answer: "ਮੈਂਟਰਾਂ ਵਿੱਚ IIT ਰੋਪੜ ਦੇ ਪੀਐਚਡੀ ਸਕਾਲਰ, ਪ੍ਰਮੁੱਖ ਖੋਜਕਰਤਾ ਅਤੇ ਸੀਨੀਅਰ ਇੰਜੀਨੀਅਰ ਸ਼ਾਮਲ ਹਨ। ਸਲਾਹਕਾਰ ਤੁਹਾਡੇ ਦੁਆਰਾ ਦਿੱਤੀਆਂ ਗਈਆਂ ਤਰਜੀਹਾਂ (ਜਿਵੇਂ ਕਿ ਕਲਾਉਡ, ਏਆਈ, ਫਰੰਟਐਂਡ, ਸਿਸਟਮ) ਦੇ ਅਧਾਰ 'ਤੇ ਚੁਣੇ ਜਾਂਦੇ ਹਨ। ਜੇਕਰ 30 ਮਈ ਤੱਕ ਕੋਈ ਮੈਂਟਰ ਡੈਸ਼ਬੋਰਡ 'ਤੇ ਨਹੀਂ ਦਿਖਾਈ ਦਿੰਦਾ, ਤਾਂ ਅਲਰਟ ਪੋਸਟ ਕਰਨ ਲਈ ਯਕਸ਼ ਚੈਟ ਦੀ ਵਰਤੋਂ ਕਰੋ, ਜਾਂ Slack 'ਤੇ `#mentorship-matching` ਚੈਨਲ ਵਿੱਚ ਸੰਪਰਕ ਕਰੋ।",
      tags: ["ਸਲਾਹਕਾਰ", "ਸਹਾਇਤਾ", "ਸਲੈਕ"]
    },
    es: {
      question: "¿Quién será mi mentor y qué pasa si aún no se me ha asignado ninguno?",
      answer: "Los mentores son estudiantes de doctorado de IIT Ropar, investigadores principales e ingenieros senior. Los mentores se asignan en función de las preferencias de dominio que especificó durante la selección (por ejemplo, nube, IA, frontend, sistemas). Si no hay ningún mentor visible en su panel antes del 30 de mayo, use Yaksha Chat para publicar una alerta, o envíe un mensaje al canal '#mentorship-matching' en Slack.",
      tags: ["Mentoría", "Soporte", "Slack"]
    }
  },
  "FAQ-009": {
    hi: {
      question: "इंटर्नशिप परियोजनाओं का चयन या आवंटन कैसे किया जाता है?",
      answer: "विचारणशाला लैब में की जाने वाली परियोजनाएं संरचित ओपन-सोर्स योगदान या क्लाउड/सिस्टम चुनौतियां हैं। टीमें सप्ताह 1 के दौरान एक कस्टम शोध प्रस्ताव पेश कर सकती हैं, या लैब निदेशकों द्वारा तैयार 'सक्रिय परियोजना सूची' से चुन सकती हैं। परियोजना घोषणाओं को 5 जून, 2026 तक ViBe प्लेटफॉर्म पर अंतिम रूप दिया जाना चाहिए।",
      tags: ["परियोजनाएं", "इंजीनियरिंग", "पाठ्यक्रम"]
    },
    pa: {
      question: "ਇੰਟਰਨਸ਼ਿਪ ਪ੍ਰੋਜੈਕਟਾਂ ਦੀ ਚੋਣ ਜਾਂ ਅਲਾਟਮੈਂਟ ਕਿਸ ਤਰ੍ਹਾਂ ਕੀਤੀ ਜਾਂਦੀ ਹੈ?",
      answer: "ਵਿਚਾਰਣਸ਼ਾਲਾ ਲੈਬ ਵਿੱਚ ਪ੍ਰੋਜੈਕਟ ਓਪਨ-ਸੋਰਸ ਯੋਗਦਾਨ ਜਾਂ ਕਲਾਉਡ/ਸਿਸਟਮ ਚੁਣੌਤੀਆਂ ਹਨ। ਟੀਮਾਂ ਪਹਿਲੇ ਹਫ਼ਤੇ ਦੌਰਾਨ ਖੋਜ ਪ੍ਰਸਤਾਵ ਪੇਸ਼ ਕਰ ਸਕਦੀਆਂ ਹਨ, ਜਾਂ ਲੈਬ ਡਾਇਰੈਕਟਰਾਂ ਦੁਆਰਾ ਤਿਆਰ ਕੀਤੇ ਗਏ 'ਐਕਟਿਵ ਪ੍ਰੋਜੈਕਟ ਕੈਟਾਲਾਗ' ਵਿੱਚੋਂ ਚੋਣ ਕਰ ਸਕਦੀਆਂ ਹਨ। ਪ੍ਰੋਜੈਕਟਾਂ ਦੀ ਘੋਸ਼ਣਾ ਨੂੰ 5 ਜੂन, 2026 ਤੱਕ ViBe ਪਲੇਟਫਾਰਮ 'ਤੇ ਅੰਤਿਮ ਰੂਪ ਦਿੱਤਾ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ।",
      tags: ["ਪ੍ਰੋਜੈਕਟ", "ਇੰਜੀਨੀਅਰਿੰਗ", "ਸਿਲੇਬਸ"]
    },
    es: {
      question: "¿Cómo se seleccionan o asignan los proyectos de pasantías?",
      answer: "Los proyectos en Vicharanashala Lab son contribuciones estructuradas de código abierto o desafíos de sistemas/nube centrados en el cliente. Los equipos pueden presentar una propuesta de investigación personalizada durante la Semana 1, o elegir del 'Catálogo de proyectos activos' preparado por los directores de laboratorio. Las declaraciones de proyectos deben finalizarse en la plataforma ViBe antes del 5 de junio de 2026.",
      tags: ["Proyectos", "Ingeniería", "Plan de estudios"]
    }
  },
  "FAQ-010": {
    hi: {
      question: "यक्ष एआई (Yaksha AI) क्या है और मुझे मदद के लिए इसका उपयोग कैसे करना चाहिए?",
      answer: "यक्ष एआई एक अनुकूलित एलएलएम (LLM) एजेंट है जिसे विचारणशाला लैब के दस्तावेजों पर प्रशिक्षित किया गया है। यक्ष-मिनी (फ्लोटिंग सहायक) और यक्ष चैट मैक्स के रूप में उपलब्ध, यह प्रश्न संरेखण, एनओसी सत्यापन सलाह, कोड डिबगिंग और रोसेटा जर्नल संक्षेपीकरण का समर्थन करता है। यह सीधे शीर्ष-स्तरीय सर्वर आर्किटेक्चर पर चलता है।",
      tags: ["यक्ष एआई", "सहायता", "चैटबॉट"]
    },
    pa: {
      question: "ਯਕਸ਼ ਏਆਈ (Yaksha AI) ਕੀ ਹੈ ਅਤੇ ਮੈਨੂੰ ਮਦਦ ਲਈ ਇਸਦੀ ਵਰਤੋਂ ਕਿਵੇਂ ਕਰਨੀ ਚਾਹੀਦੀ ਹੈ?",
      answer: "ਯਕਸ਼ ਏਆਈ ਇੱਕ ਅਨੁਕੂਲਿਤ LLM ਏਜੰਟ ਹੈ ਜਿਸਨੂੰ ਵਿਚਾਰਣਸ਼ਾਲਾ ਲੈਬ ਦੇ ਦਸਤਾਵੇਜ਼ਾਂ 'ਤੇ ਸਿਖਲਾਈ ਦਿੱਤੀ ਗਈ ਹੈ। ਯਕਸ਼-ਮਿਨੀ (ਫਲੋਟਿੰਗ ਸਹਾਇਕ) ਅਤੇ ਯਕਸ਼ ਚੈਟ ਮੈਕਸ ਦੇ ਰੂਪ ਵਿੱਚ ਉਪਲਬਧ, ਇਹ ਸਵਾਲਾਂ ਦੇ ਹੱਲ, ਐਨਓਸੀ ਵੈਰੀਫਿਕੇਸ਼ਨ ਸਲਾਹ, ਕੋਡ ਡੀਬੱਗਿੰਗ, ਅਤੇ ਰੋਸੇਟਾ ਜਰਨਲ ਸੰਖੇਪ ਦਾ ਸਮਰਥਨ ਕਰਦਾ ਹੈ। ਇਹ ਸਿੱਧੇ ਸਰਵਰਾਂ 'ਤੇ ਚੱਲਦਾ ਹੈ।",
      tags: ["ਯਕਸ਼ ਏਆਈ", "ਸਹਾਇਤਾ", "ਚੈਟਬਾਕਸ"]
    },
    es: {
      question: "¿Qué es Yaksha AI y cómo debo usarlo para obtener ayuda?",
      answer: "Yaksha AI es un agente LLM personalizado entrenado en documentos de Vicharanashala Lab. Disponible como Yaksha-mini (asistente flotante) y Yaksha Chat Max, admite la resolución de consultas, asesoramiento de verificación de NOC, depuración de código y resúmenes del Rosetta Journal. Se ejecuta directamente en arquitecturas de servidor de primer nivel.",
      tags: ["Yaksha AI", "Soporte", "Chatbot"]
    }
  },
  "FAQ-011": {
    hi: {
      question: "ViBe प्लेटफॉर्म क्या है और मुझे डेवलपर एक्सेस कैसे मिलेगा?",
      answer: "विचारणशाला बोर्ड एंड इकोसिस्टम (ViBe) वह मालिकाना वर्कस्पेस है जहां टीमें अपने स्प्रिंट बोर्डों को ट्रैक करती हैं, साप्ताहिक लॉग सबमिट करती हैं, एपीआई विनिर्देशों की समीक्षा करती हैं और मील के पत्थर लॉग करती हैं। क्रेडेंशियल कार्यक्रम शुरू होने से 48 घंटे पहले आपको ईमेल किए जाते हैं। यदि आपका खाता लॉक है, तो एडमिन/यूजर पैनल के अंदर पुनः सक्रियण का अनुरोध सबमिट करें।",
      tags: ["ViBe प्लेटफार्म", "सॉफ्टवेयर", "क्रेडेंशियल्स"]
    },
    pa: {
      question: "ViBe ਪਲੇਟਫਾਰਮ ਕੀ ਹੈ ਅਤੇ ਮੈਨੂੰ ਡਿਵੈਲਪਰ ਐਕਸੈਸ ਕਿਵੇਂ ਮਿਲੇਗਾ?",
      answer: "ਵਿਚਾਰਣਸ਼ਾਲਾ ਬੋਰਡ ਐਂਡ ਈਕੋਸਿਸਟਮ (ViBe) ਉਹ ਨਿੱਜੀ ਵਰਕਸਪੇਸ ਹੈ ਜਿੱਥੇ ਟੀਮਾਂ ਆਪਣੇ ਸਪ੍ਰਿੰਟ ਬੋਰਡਾਂ ਨੂੰ ਟਰੈਕ ਕਰਦੀਆਂ ਹਨ, ਹਫਤਾਵਾਰੀ ਲੌਗਸ ਜਮ੍ਹਾਂ ਕਰਦੀਆਂ ਹਨ, API ਵਿਸ਼ੇਸ਼ਤਾਵਾਂ ਦੀ ਸਮੀਖਿਆ ਕਰਦੀਆਂ ਹਨ। ਲੌਗਿਨ ਵੇਰਵੇ ਪ੍ਰੋਗਰਾਮ ਸ਼ੁਰੂ ਹੋਣ ਤੋਂ 48 ਘੰਟੇ ਪਹਿਲਾਂ ਈਮੇਲ ਕੀਤੇ ਜਾਂਦੇ ਹਨ। ਜੇਕਰ ਤੁਹਾਡਾ ਖਾਤਾ ਲੌਕ ਹੈ, ਤਾਂ ਐਡਮਿਨ/ਯੂਜ਼ਰ ਪੈਨਲ ਦੇ ਅੰਦਰ ਮੁੜ-ਸਰਗਰਮ ਕਰਨ ਦੀ ਬੇਨਤੀ ਭੇਜੋ।",
      tags: ["ViBe ਪਲੇਟਫਾਰਮ", "ਸਾਫਟਵੇਅਰ", "ਕ੍ਰੇਡੇਨਸ਼ਿਅਲਸ"]
    },
    es: {
      question: "¿Qué es la plataforma ViBe y cómo obtengo acceso de desarrollador?",
      answer: "Vicharanashala Board & Ecosystem (ViBe) es el espacio de trabajo patentado donde los equipos realizan un seguimiento de sus tableros de sprint, envían registros semanales, revisan especificaciones de API y registran hitos. Las credenciales de acceso se envían por correo electrónico 48 horas antes del lanzamiento del programa. Si su cuenta está bloqueada, envíe una solicitud de reactivación dentro del panel de administración/usuario.",
      tags: ["Plataforma ViBe", "Software", "Credenciales"]
    }
  },
  "FAQ-012": {
    hi: {
      question: "रोसेटा जर्नल (Rosetta Journal) की क्या आवश्यकता है?",
      answer: "रोसेटा जर्नल आपकी व्यक्तिगत इंजीनियरिंग डायरी है। प्रत्येक इंटर्न को कोड पुश, पढ़े गए शोध पत्रों, डीबग की गई समस्याओं और मील के पत्थर के अनुमानों को सारांशित करते हुए एक साप्ताहिक लॉग लिखने की आवश्यकता होती है। प्रत्येक शनिवार रात 11:59 बजे तक, आपकी रोसेटा प्रविष्टि ViBe पर सबमिट की जानी चाहिए। इन लॉगों का सीधे मेंटर्स द्वारा मूल्यांकन किया जाता है और यह वजीफा सत्यापन को तय करते हैं।",
      tags: ["रोसेटा जर्नल", "लॉग्स", "ग्रेडिंग"]
    },
    pa: {
      question: "ਰੋਸੇਟਾ ਜਰਨਲ (Rosetta Journal) ਦੀ ਕੀ ਜ਼ਰੂਰਤ ਹੈ?",
      answer: "ਰੋਸੇਟਾ ਜਰਨਲ ਤੁਹਾਡੀ ਨਿੱਜੀ ਇੰਜੀਨੀਅਰਿੰਗ ਡਾਇਰੀ ਹੈ। ਹਰੇਕ ਇੰਟਰਨ ਨੂੰ ਹਫਤਾਵਾਰੀ ਲੌਗ ਲਿਖਣ ਦੀ ਲੋੜ ਹੁੰਦੀ ਹੈ ਜਿਸ ਵਿੱਚ ਕੋਡ, ਪੜ੍ਹੇ ਗਏ ਖੋਜ ਪੱਤਰ, ਡੀਬੱਗ ਕੀਤੀਆਂ ਸਮੱਸਿਆਵਾਂ ਅਤੇ ਪ੍ਰਗਤੀ ਸ਼ਾਮਲ ਹੋਵੇ। ਹਰ ਸ਼ਨੀਵਾਰ ਰਾਤ 11:59 ਵਜੇ ਤੱਕ, ਤੁਹਾਡੀ ਰੋਸੇਟਾ ਐਂਟਰੀ ViBe 'ਤੇ ਜਮ੍ਹਾਂ ਹੋਣੀ ਚਾਹੀਦੀ ਹੈ। ਇਹ ਲੌਗ ਸਿੱਧੇ ਸਲਾਹਕਾਰਾਂ ਦੁਆਰਾ ਦੇਖੇ ਜਾਂਦੇ ਹਨ ਅਤੇ ਵਜ਼ੀਫ਼ੇ ਦਾ ਫੈਸਲਾ ਕਰਦੇ ਹਨ।",
      tags: ["ਰੋਸੇਟਾ ਜਰਨਲ", "ਲੌਗਸ", "ਗ੍ਰੇਡਿੰਗ"]
    },
    es: {
      question: "¿Cuál es el requisito del Rosetta Journal?",
      answer: "El Rosetta Journal es su diario de ingeniería personalizado. Cada pasante debe escribir un registro semanal que resuma el código enviado, los artículos leídos, los problemas depurados y las proyecciones de hitos. Todos los sábados antes de las 11:59 PM, debe enviar su entrada de Rosetta en ViBe. Estos registros son evaluados directamente por los mentores y determinan la validación del estipendio.",
      tags: ["Rosetta Journal", "Registros", "Calificación"]
    }
  },
  "FAQ-013": {
    hi: {
      question: "क्या मैं अपनी खुद की टीम बना सकता हूँ, और टीम के आकार की क्या सीमा है?",
      answer: "हाँ। विचारणशाला सहयोगी प्रणालियों के निर्माण को बढ़ावा देती है। आप '#team-formation' चैनल या डैशबोर्ड रजिस्ट्री के माध्यम से भागीदार पा सकते हैं। टीमों में 3 से 5 इंटर्न होने चाहिए। प्रत्येक टीम को एक नामित स्क्रम मास्टर की आवश्यकता होती है जो मुख्य मेंटर्स के साथ प्राथमिक संपर्क के रूप में कार्य करता है। एकल-सदस्यीय परियोजना छूट को लैब निदेशक द्वारा अनुमोदित किया जाना चाहिए।",
      tags: ["टीमें", "समूह", "सहयोग"]
    },
    pa: {
      question: "ਕੀ ਮੈਂ ਆਪਣੀ ਖੁਦ ਦੀ ਟੀਮ ਬਣਾ ਸਕਦਾ ਹਾਂ, ਅਤੇ ਟੀਮ ਦੇ ਆਕਾਰ ਦੀ ਕੀ ਸੀਮਾ ਹੈ?",
      answer: "ਹਾਂ। ਵਿਚਾਰਣਸ਼ਾਲਾ ਸਿਸਟਮ ਨਿਰਮਾਣ ਵਿੱਚ ਸਹਿਯੋਗ ਨੂੰ ਉਤਸ਼ਾਹਿਤ ਕਰਦੀ ਹੈ। ਤੁਸੀਂ '#team-formation' ਚੈਨਲ ਜਾਂ ਡੈਸ਼ਬੋਰਡ ਰਜਿਸਟਰੀ ਰਾਹੀਂ ਭਾਗੀਦਾਰ ਲੱਭ ਸਕਦੇ ਹੋ। ਟੀਮ ਵਿੱਚ 3 ਤੋਂ 5 ਇੰਟਰਨ ਹੋਣੇ ਚਾਹੀਦੇ ਹਨ। ਹਰੇਕ ਟੀਮ ਨੂੰ ਇੱਕ ਸਕ੍ਰਮ ਮਾਸਟਰ ਦੀ ਲੋੜ ਹੁੰਦੀ ਹੈ ਜੋ ਮੁੱਖ ਸਲਾਹਕਾਰਾਂ ਨਾਲ ਸੰਪਰਕ ਕਰਦਾ ਹੈ। ਇਕੱਲੇ ਮੈਂਬਰ ਦੇ ਪ੍ਰੋਜੈਕਟ ਦੀ ਮਨਜ਼ੂਰੀ ਲੈਬ ਡਾਇਰੈਕਟਰ ਦੁਆਰਾ ਦਿੱਤੀ ਜਾਣੀ ਚਾਹੀਦੀ ਹੈ।",
      tags: ["ਟੀਮਾਂ", "ਗਰੁੱਪ", "ਸਹਿਯੋਗ"]
    },
    es: {
      question: "¿Puedo formar mi propio equipo y cuál es el límite de tamaño del equipo?",
      answer: "Sí. Vicharanashala promueve la construcción colaborativa de sistemas. Puede encontrar socios en el canal '#team-formation' o a través del registro del Panel de usuario. Los equipos deben estar compuestos por 3 a 5 pasantes. Cada equipo necesita un Scrum Master designado que sirva como contacto principal con los mentores principales. Las excepciones para proyectos de un solo miembro deben ser aprobadas por el Director del Laboratorio.",
      tags: ["Equipos", "Grupo", "Colaboración"]
    }
  },
  "FAQ-014": {
    hi: {
      question: "क्या समय-समय पर प्रगति मूल्यांकन या मध्यावधि इंटरव्यू होते हैं?",
      answer: "हाँ, दो मील के पत्थर मूल्यांकन हैं: एक मध्यावधि समीक्षा (सप्ताह 5) और एक अंतिम रक्षा (सप्ताह 10)। मूल्यांकनों में कोडबेस वॉकथ्रू, स्लाइड्स डेक रक्षा और शैक्षणिक और उद्योग विशेषज्ञों की एक बाहरी समिति के साथ तकनीकी प्रश्नोत्तर शामिल हैं। प्रदर्शन ग्रेड सीधे आपके अंतिम आईआईटी रोपड़ अनुशंसा पत्र पर प्रतिबिंबित होता है।",
      tags: ["मूल्यांकन", "इंटरव्यू", "ग्रेडिंग"]
    },
    pa: {
      question: "ਕੀ ਸਮੇਂ-ਸਮੇਂ 'ਤੇ ਪ੍ਰਗਤੀ ਦਾ ਮੁਲਾਂਕਣ ਜਾਂ ਮਿਡ-ਟਰਮ ਇੰਟਰਵਿਊ ਹੁੰਦੇ ਹਨ?",
      answer: "ਹਾਂ, ਦੋ ਮੁਲਾਂਕਣ ਹੁੰਦੇ ਹਨ: ਇੱਕ ਮਿਡ-ਟਰਮ ਸਮੀਖਿਆ (ਹਫ਼ਤਾ 5) ਅਤੇ ਅੰਤਿਮ ਪੇਸ਼ਕਾਰੀ (ਹਫ਼ਤਾ 10)। ਮੁਲਾਂਕਣਾਂ ਵਿੱਚ ਕੋਡਬੇਸ 'ਤੇ ਨਜ਼ਰਸਾਨੀ, ਸਲਾਈਡਾਂ ਦੀ ਪੇਸ਼ਕਾਰੀ, ਅਤੇ ਅਕਾਦਮਿਕ ਅਤੇ ਉਦਯੋਗ ਮਾਹਿਰਾਂ ਦੀ ਇੱਕ ਬਾਹਰੀ ਕਮੇਟੀ ਨਾਲ ਸਵਾਲ-ਜਵਾਬ ਸ਼ਾਮਲ ਹਨ। ਤੁਹਾਡੀ ਕਾਰਗੁਜ਼ਾਰੀ ਸਿੱਧੇ ਤੌਰ 'ਤੇ ਤੁਹਾਡੇ ਸਿਫਾਰਸ਼ ਪੱਤਰ 'ਤੇ ਪ੍ਰਭਾਵ ਪਾਉਂਦੀ ਹੈ।",
      tags: ["ਮੁਲਾਂਕਣ", "ਇੰਟਰਵਿਊ", "ਗ੍ਰੇਡਿੰਗ"]
    },
    es: {
      question: "¿Hay evaluaciones periódicas de progreso o entrevistas de mitad de período?",
      answer: "Sí, hay dos evaluaciones de hitos: una revisión de mitad de período (semana 5) y una defensa final (semana 10). Las evaluaciones incluyen un recorrido por el código base, la defensa de la presentación de diapositivas y preguntas y respuestas técnicas con un comité externo de especialistas académicos y de la industria. Las métricas de calificación de rendimiento se reflejan directamente en su carta de recomendación final de IIT Ropar.",
      tags: ["Evaluaciones", "Entrevistas", "Calificación"]
    }
  },
  "FAQ-015": {
    hi: {
      question: "इंटर्नशिप के लिए किन संचार चैनलों का उपयोग किया जाता है?",
      answer: "हम एक समर्पित स्लैक वर्कस्पेस और ViBe मैसेजिंग मॉड्यूल का उपयोग करते हैं। स्लैक वर्कस्पेस में दैनिक स्टैंडअप (#daily-updates), सिस्टम घोषणाएं (#announcements), डोमेन समूह (#domain-systems, #domain-ai), और आरामदेह बातचीत के लिए (#watercooler) चैनल हैं। मेंटर्स सप्ताह में तीन बार गूगल मीट पर सिंक कॉल करते हैं।",
      tags: ["संचार", "स्लैक", "बैठकें"]
    },
    pa: {
      question: "ਇੰਟਰਨਸ਼ਿਪ ਲਈ ਕਿਹੜੇ ਸੰਚਾਰ ਚੈਨਲਾਂ ਦੀ ਵਰਤੋਂ ਕੀਤੀ ਜਾਂਦੀ ਹੈ?",
      answer: "ਅਸੀਂ ਇੱਕ ਸਮਰਪਿਤ ਸਲੈਕ ਵਰਕਸਪੇਸ ਅਤੇ ViBe ਮੈਸੇਜਿੰਗ ਮੋਡੀਊਲ ਦੀ ਵਰਤੋਂ ਕਰਦੇ ਹਾਂ। ਸਲੈਕ ਚੈਨਲਾਂ ਵਿੱਚ ਰੋਜ਼ਾਨਾ ਅੱਪਡੇਟ (#daily-updates), ਸਿਸਟਮ ਘੋਸ਼ਣਾਵਾਂ (#announcements), ਡੋਮੇਨ ਗਰੁੱਪ (#domain-systems) ਸ਼ਾਮਲ ਹਨ। ਸਲਾਹਕਾਰ ਹਫ਼ਤੇ ਵਿੱਚ ਤਿੰਨ ਵਾਰ ਗੂਗਲ ਮੀਟ 'ਤੇ ਵੀਡੀਓ ਕਾਲ ਕਰਦੇ ਹਨ।",
      tags: ["ਸੰਚਾਰ", "ਸਲੈਕ", "ਮੀਟਿੰਗਾਂ"]
    },
    es: {
      question: "¿Qué canales de comunicación se utilizan para la pasantía?",
      answer: "Utilizamos un espacio de trabajo de Slack dedicado y el módulo de mensajería ViBe. El espacio de trabajo de Slack tiene canales para standups diarios (#daily-updates), anuncios del sistema (#announcements), grupos de dominio (#domain-systems, #domain-ai) y relajación (#watercooler). Los mentores realizan llamadas de sincronización en Google Meet tres veces por semana.",
      tags: ["Comunicación", "Slack", "Reuniones"]
    }
  },
  "FAQ-016": {
    hi: {
      question: "स्फूर्ति अंक (SP) क्या हैं और क्या वे मेरी इंटर्नशिप के मूल्यांकन या परिणाम को प्रभावित करते हैं?",
      answer: "स्फूर्ति अंक (Spurti Points / SP) वर्तमान में बीटा में हैं और हो सकता है कि वे आपके प्रयास को सटीक रूप से न दर्शाएं। उच्च एसपी कभी-कभी पहचान या छोटे लाभ प्रदान कर सकते हैं, लेकिन वे इंटर्नशिप के अंतिम परिणामों को निर्धारित नहीं करते हैं। महत्वपूर्ण रूप से, एसपी शून्य या ऋणात्मक हो सकता है, और यह पूरी तरह से ठीक है और कोई समस्या नहीं है।",
      tags: ["स्फूर्ति अंक", "SP", "ग्रेडिंग", "परिणाम"]
    },
    pa: {
      question: "ਸਫੂਰਤੀ ਪੁਆਇੰਟ (SP) ਕੀ ਹਨ ਅਤੇ ਕੀ ਉਹ ਮੇਰੀ ਇੰਟਰਨਸ਼ਿਪ ਦੇ ਕੀਤੇ ਗਏ ਕੰਮ ਜਾਂ ਨਤੀਜੇ ਨੂੰ ਪ੍ਰਭਾਵਿਤ ਕਰਦੇ ਹਨ?",
      answer: "ਸਫੂਰਤੀ ਪੁਆਇੰਟ (SP) ਵਰਤਮਾਨ ਵਿੱਚ ਬੀਟਾ ਅਵਸਥਾ ਵਿੱਚ ਹਨ ਅਤੇ ਹੋ ਸਕਦਾ ਹੈ ਕਿ ਇਹ ਤੁਹਾਡੀ ਕੋਸ਼ਿਸ਼ ਨੂੰ ਸਹੀ ਤਰ੍ਹਾਂ ਨਾ ਦਰਸਾਉਣ। ਉੱਚੇ SP ਕਦੇ-ਕਦੇ ਮਾਨਤਾ ਜਾਂ ਛੋਟੇ ਲਾਭ ਦੇ ਸਕਦੇ ਹਨ, ਪਰ ਇਹ ਫੈਸਲਾਕੁਨ ਨਤੀਜੇ ਤੈਅ ਨਹੀਂ ਕਰਦੇ। ਇਹ ਪੁਆਇੰਟ ਜ਼ੀਰੋ ਜਾਂ ਨੈਗੇਟਿਵ ਵੀ ਹੋ ਸਕਦੇ ਹਨ, ਜੋ ਕਿ ਪੂਰੀ ਤਰ੍ਹਾਂ ਠੀਕ ਹੈ।",
      tags: ["ਸਫੂਰਤੀ ਪੁਆਇੰਟ", "SP", "ਗ੍ਰੇਡਿੰਗ", "ਨਤੀਜੇ"]
    },
    es: {
      question: "¿Qué son los Puntos Spurti (SP) y afectan mi evaluación o resultado de la pasantía?",
      answer: "Los Puntos Spurti (SP) se encuentran actualmente en versión beta y es posible que no reflejen con precisión el esfuerzo. Un SP más alto puede proporcionar ocasionalmente reconocimiento o pequeñas ventajas, pero NO determinan los resultados de la pasantía. Es importante destacar que el SP puede ser cero o negativo, y esto está completamente bien y no es un problema.",
      tags: ["Puntos Spurti", "SP", "Calificación", "Resultado"]
    }
  },
  "FAQ-017": {
    hi: {
      question: "रोलिंग आधार पर निगरानी की जाने वाली सख्त भागीदारी आवश्यकताएं क्या हैं?",
      answer: "विचारणशाला इंटर्नशिप कार्यक्रम पिछले 5 कार्य दिवसों को कवर करते हुए रोलिंग आधार पर भागीदारी का कड़ाई से मूल्यांकन करता है। प्रत्येक इंटर्न को एक साथ तीन शर्तों को पूरा करना होगा:\n- कुल ज़ूम सत्र समय का कम से कम 85% भाग लें।\n- कम से कम 85% पोल और क्विज़ का उत्तर दें।\n- प्रत्येक क्विज़ का प्रयास करें और कम से कम 50% स्कोर करें।\n\nतीनों शर्तें एक साथ पूरी होनी चाहिए। यदि कोई आवश्यकता इन थ्रेसहोल्ड से नीचे गिरती है, तो इंटर्न को बाद के बैच में स्थानांतरित किया जा सकता है।",
      tags: ["भागीदारी", "ज़ूम", "क्विज़", "रोलिंग आधार", "नियम"]
    },
    pa: {
      question: "ਰੋਲਿੰਗ ਅਧਾਰ 'ਤੇ ਨਿਗਰਾਨੀ ਅਧੀਨ ਕੀਤੀਆਂ ਗਈਆਂ ਸਖ਼ਤ ਭਾਗੀਦਾਰੀ ਦੀਆਂ ਸ਼ਰਤਾਂ ਕੀ ਹਨ?",
      answer: "ਵਿਚਾਰਣਸ਼ਾਲਾ ਇੰਟਰਨਸ਼ਿਪ ਪ੍ਰੋਗਰਾਮ ਪਿਛਲੇ 5 ਕੰਮਕਾਜੀ ਦਿਨਾਂ 'ਤੇ ਰੋਲਿੰਗ ਅਧਾਰ 'ਤੇ ਭਾਗੀਦਾਰੀ ਦਾ ਮੁਲਾਂਕਣ ਕਰਦਾ ਹੈ। ਹਰੇਕ ਇੰਟਰਨ ਨੂੰ ਤਿੰਨ ਸ਼ਰਤਾਂ ਪੂਰੀਆਂ ਕਰਨੀਆਂ ਪੈਣਗੀਆਂ:\n- ਕੁੱਲ ਜ਼ੂਮ ਸੈਸ਼ਨ ਦੇ ਸਮੇਂ ਦਾ ਘੱਟੋ-ਘੱਟ 85% ਹਿੱਸਾ ਲਓ।\n- ਘੱਟੋ-ਘੱਟ 85% ਪੋਲ ਅਤੇ ਕੁਇਜ਼ ਦੇ ਜਵਾਬ ਦਿਓ।\n- ਹਰ ਕੁਇਜ਼ ਦੀ ਕੋਸ਼ਿਸ਼ ਕਰੋ ਅਤੇ ਘੱਟੋ-ਘੱਟ 50% ਸਕੋਰ ਬਣਾਓ।\n\nਇਹ ਤਿੰਨੋਂ ਸ਼ਰਤਾਂ ਇੱਕੋ ਸਮੇਂ ਪੂਰੀਆਂ ਹੋਣੀਆਂ ਚਾਹੀਦੀਆਂ ਹਨ। ਜੇਕਰ ਕੋਈ ਸ਼ਰਤ ਘੱਟਦੀ ਹੈ ਤਾਂ ਅਗਲੇ ਬੈਚ ਵਿੱਚ ਬਦਲਿਆ ਜਾ ਸਕਦਾ ਹੈ।",
      tags: ["ਭਾਗੀਦਾਰੀ", "ਜ਼ੂਮ", "ਕੁਇਜ਼", "ਰੋਲਿੰਗ ਅਧਾਰ", "ਨਿਯਮ"]
    },
    es: {
      question: "¿Cuáles son los requisitos estrictos de participación supervisados de forma continua?",
      answer: "El Programa de Pasantías de Vicharanashala evalúa estrictamente la participación de forma continua cubriendo los últimos 5 días hábiles (cada nuevo día reemplaza continuamente al día más antiguo en la ventana de evaluación). Cada pasante debe cumplir tres condiciones simultáneamente:\n- Asistir al menos al 85% del tiempo total de la sesión de Zoom.\n- Responder al menos al 85% de las encuestas y cuestionarios.\n- Intentar cada cuestionario y obtener al menos 50% de calificación.\n\nLas tres condiciones deben cumplirse simultáneamente. Si algún requisito cae por debajo de estos umbrales, el pasante puede ser trasladado a un lote posterior.",
      tags: ["Participación", "Zoom", "Cuestionarios", "Base Continua", "Reglas"]
    }
  },
  "FAQ-018": {
    hi: {
      question: "ViBe प्लेटफॉर्म के लिए नियम और समर्थित उपकरण क्या हैं?",
      answer: "ViBe प्लेटफॉर्म केवल डेस्कटॉप और लैपटॉप कंप्यूटर का समर्थन करता है। मोबाइल फोन और टैबलेट समर्थित नहीं हैं। इसके अलावा, पाठ्यक्रम एक सख्त रैखिक प्रगति का पालन करते हैं। सभी वीडियो और क्विज़ को क्रमिक रूप से पूरा किया जाना चाहिए, और आगे बढ़ने की अनुमति नहीं है। यदि आप किसी पाठ्यक्रम आइटम पर 'एक्सेस प्रतिबंधित' देखते हैं, तो इसका मतलब है कि पिछला आवश्यक आइटम अभी तक पूरा नहीं हुआ है।",
      tags: ["ViBe प्लेटफार्म", "उपकरण", "रैखिक प्रगति", "प्रतिबंधित"]
    },
    pa: {
      question: "ViBe ਪਲੇਟਫਾਰਮ ਲਈ ਨਿਯਮ ਅਤੇ ਸਮਰਥਿਤ ਡਿਵਾਈਸਾਂ ਕੀ ਹਨ?",
      answer: "ViBe ਪਲੇਟਫਾਰਮ ਕੇਵਲ ਡੈਸਕਟੌਪ ਅਤੇ ਲੈਪਟਾਪ ਕੰਪਿਊਟਰਾਂ ਦਾ ਸਮਰਥਨ ਕਰਦਾ ਹੈ। ਮੋਬਾਈਲ ਫੋਨ ਅਤੇ ਟੈਬਲੇਟ ਸਮਰਥਿਤ ਨਹੀਂ ਹਨ। ਇਸ ਤੋਂ ਇਲਾਵਾ, ਕੋਰਸ ਇੱਕ ਸਖ਼ਤ ਰੇਖਿਕ ਪ੍ਰਗਤੀ ਦੀ ਪਾਲਣਾ ਕਰਦੇ ਹਨ। ਸਾਰੇ ਵੀਡੀਓ ਅਤੇ ਕੁਇਜ਼ ਕ੍ਰਮਵਾਰ ਪੂਰੇ ਕੀਤੇ ਜਾਣੇ ਚਾਹੀਦੇ ਹਨ। ਜੇਕਰ ਤੁਸੀਂ ਕਿਸੇ ਆਈਟਮ 'ਤੇ 'Access Restricted' ਦੇਖਦੇ ਹੋ, ਤਾਂ ਇਸਦਾ ਮਤਲਬ ਹੈ ਕਿ ਪਿਛਲੀ ਲੋੜੀਂਦੀ ਆਈਟਮ ਅਜੇ ਪੂਰੀ ਨਹੀਂ ਹੋਈ ਹੈ।",
      tags: ["ViBe ਪਲੇਟਫਾਰਮ", "ਡਿਵਾਈਸਾਂ", "ਰੇਖਿਕ ਪ੍ਰਗਤੀ", "ਪ੍ਰਤਿਬੰਧਿਤ"]
    },
    es: {
      question: "¿Cuáles son las reglas y los dispositivos compatibles para la plataforma ViBe?",
      answer: "La Plataforma ViBe solo admite computadoras de escritorio y portátiles. Los teléfonos móviles y las tabletas no son compatibles. Además, los cursos siguen una progresión lineal estricta. Todos los videos y cuestionarios deben completarse secuencialmente, y no se permite avanzar. Si ve 'Acceso restringido' en un elemento del curso, significa que un elemento requerido anterior aún no se ha completado.",
      tags: ["Plataforma ViBe", "Dispositivos", "Progresión Lineal", "Restringido"]
    }
  },
  "FAQ-019": {
    hi: {
      question: "मैं ViBe प्लेटफॉर्म पर अपने पाठ्यक्रम नहीं देख पा रहा हूं या लॉग इन नहीं कर पा रहा हूं। मैं इसे कैसे ठीक करूं?",
      answer: "सबसे पहले, सुनिश्चित करें कि आप अपने पंजीकृत ईमेल आईडी का उपयोग करके लॉग इन कर रहे हैं और पाठ्यक्रम आमंत्रणों को स्वीकार करने के लिए अपने अधिसूचना (Notifications) पैनल की जांच कर रहे हैं। यदि पाठ्यक्रम अभी भी दिखाई नहीं देते हैं, तो कृपया ये समस्या निवारण कदम उठाएं:\n1. अपनी पंजीकृत ईमेल आईडी सत्यापित करें।\n2. अपने ब्राउज़र कैशे को साफ़ करें।\n3. ब्राउज़र कुकीज़ की अनुमति दें।\n4. अपने स्थानीय कंप्यूटर की प्राथमिक DNS सेटिंग्स को अपडेट करें।\n5. अपना DNS कैशे फ्लश करें (जैसे, ipconfig /flushdns चलाएं) और फिर से लॉगिन करें।",
      tags: ["लॉगिन", "पाठ्यक्रम पहुंच", "DNS कैशे", "समस्या निवारण"]
    },
    pa: {
      question: "ਮੈਂ ViBe ਪਲੇਟਫਾਰਮ 'ਤੇ ਆਪਣੇ ਕੋਰਸ ਨਹੀਂ ਦੇਖ ਪਾ ਰਿਹਾ ਹਾਂ ਜਾਂ ਲੌਗਇਨ ਨਹੀਂ ਕਰ ਪਾ ਰਿਹਾ ਹਾਂ। ਮੈਂ ਇਸਨੂੰ ਕਿਵੇਂ ਠੀਕ ਕਰਾਂ?",
      answer: "ਪਹਿਲਾਂ, ਯਕੀਨੀ ਬਣਾਓ ਕਿ ਤੁਸੀਂ ਆਪਣੀ ਰਜਿਸਟਰਡ ਈਮੇਲ ਆਈਡੀ ਦੀ ਵਰਤੋਂ ਕਰਕੇ ਲੌਗਇਨ ਕਰ ਰਹੇ ਹੋ ਅਤੇ ਕੋਰਸ ਦੇ ਸੱਦੇ ਨੂੰ ਸਵੀਕਾਰ ਕਰਨ ਲਈ ਆਪਣੇ ਨੋਟੀਫਿਕੇਸ਼ਨ ਪੈਨਲ ਦੀ ਜਾਂਚ ਕਰ ਰਹੇ ਹੋ। ਜੇਕਰ ਕੋਰਸ ਫਿਰ ਵੀ ਨਹੀਂ ਦਿਖਾਈ ਦਿੰਦੇ, ਤਾਂ ਕਿਰਪा ਕਰਕੇ ਇਹ ਕਦਮ ਚੁੱਕੋ:\n1. ਆਪਣੀ ਰਜਿਸਟਰਡ ਈਮੇਲ ਆਈਡੀ ਦੀ ਪੁਸ਼ਟੀ ਕਰੋ।\n2. ਆਪਣੇ ਬ੍ਰਾਊਜ਼ਰ ਦੀ ਕੈਸ਼ ਸਾਫ਼ ਕਰੋ।\n3. ਬ੍ਰਾਊਜ਼ਰ ਕੂਕੀਜ਼ ਨੂੰ ਆਗਿਆ ਦਿਓ।\n4. ਆਪਣੇ ਕੰਪਿਊਟਰ ਦੀ ਪ੍ਰਾਇਮਰੀ DNS ਸੈਟਿੰਗਾਂ ਨੂੰ ਅੱਪਡੇਟ ਕਰੋ।\n5. ਆਪਣੀ DNS ਕੈਸ਼ ਸਾਫ਼ ਕਰੋ (ਉਦਾਹਰਨ ਲਈ, ipconfig /flushdns ਚਲਾਓ) ਅਤੇ ਦੁਬਾਰਾ ਲੌਗਇਨ ਕਰੋ।",
      tags: ["ਲੌਗਇਨ", "ਕੋਰਸ ਪਹੁੰਚ", "DNS ਕੈਸ਼", "ਸਮੱਸਿਆ ਨਿਵਾਰਨ"]
    },
    es: {
      question: "No puedo ver mis cursos o iniciar sesión en la plataforma ViBe. ¿Cómo soluciono esto?",
      answer: "Primero, asegúrese de iniciar sesión con su ID de correo electrónico registrado y revisar su panel de Notificaciones para aceptar las invitaciones a los cursos. Si los cursos aún no aparecen, realice estos pasos de solución de problemas:\n1. Verifique su ID de correo electrónico registrado.\n2. Borre la caché de su navegador.\n3. Permita las cookies del navegador.\n4. Actualice la configuración de DNS principal de su computadora local.\n5. Vacíe la caché de DNS (por ejemplo, ejecute ipconfig /flushdns) y vuelva a iniciar sesión.",
      tags: ["Iniciar sesión", "Acceso al curso", "Caché DNS", "Solución de problemas"]
    }
  },
  "FAQ-020": {
    hi: {
      question: "वीडियो प्लेबैक नियम क्या हैं और ViBe पर प्रगति को कैसे ट्रैक किया जाता है?",
      answer: "सक्रिय ViBe टैब पर वीडियो पूरी तरह से और क्रम में देखे जाने चाहिए। पाठ्यक्रम प्रोक्टरिंग सेटअप के आधार पर कैमरा और माइक्रोफ़ोन अनुमतियों की आवश्यकता हो सकती है। टैब बदलने, निष्क्रिय होने, कम रोशनी या अत्यधिक पृष्ठभूमि शोर के कारण प्लेयर रुकावटें चालू हो सकती हैं। प्रगति सर्वर साइड पर संग्रहीत की जाती है और आपकी पंजीकृत ईमेल आईडी से सुरक्षित रूप से जुड़ी होती है, जिसका अर्थ है कि कैशे साफ़ करने या आपके ब्राउज़र को फिर से स्थापित करने से आपकी प्रगति कभी नहीं हटेगी या नष्ट नहीं होगी।",
      tags: ["वीडियो प्लेबैक", "प्रगति", "अनुमतियां", "कैशे"]
    },
    pa: {
      question: "ਵੀਡੀਓ ਪਲੇਬੈਕ ਨਿਯਮ ਕੀ ਹਨ ਅਤੇ ViBe 'ਤੇ ਪ੍ਰਗਤੀ ਨੂੰ ਕਿਵੇਂ ਟਰੈਕ ਕੀਤਾ ਜਾਂਦਾ ਹੈ?",
      answer: "ਵੀਡੀਓਜ਼ ਨੂੰ ਸਰਗਰਮ ViBe ਟੈਬ 'ਤੇ ਪੂਰੀ ਤਰ੍ਹਾਂ ਅਤੇ ਕ੍ਰਮ ਵਿੱਚ ਦੇਖਿਆ ਜਾਣਾ ਚਾਹੀਦਾ ਹੈ। ਕੈਮਰਾ ਅਤੇ ਮਾਈਕ੍ਰੋਫੋਨ ਦੀ ਲੋੜ ਹੋ ਸਕਦੀ ਹੈ। ਟੈਬ ਬਦਲਣ, ਵਿਹਲੇ ਰਹਿਣ, ਖਰਾਬ ਰੋਸ਼ਨੀ ਜਾਂ ਬੈਕਗ੍ਰਾਊਂਡ ਵਿੱਚ ਰੌਲੇ ਕਾਰਨ ਪਲੇਬੈਕ ਰੁਕ ਸਕਦਾ ਹੈ। ਪ੍ਰਗਤੀ ਸਰਵਰ ਵਾਲੇ ਪਾਸੇ ਸਟੋਰ ਕੀਤੀ ਜਾਂਦੀ ਹੈ ਅਤੇ ਤੁਹਾਡੀ ਰਜਿਸਟਰਡ ਈਮੇਲ ਆਈਡੀ ਨਾਲ ਸੁਰੱਖਿਅਤ ਢੰਗ ਨਾਲ ਲਿੰਕ ਹੁੰਦੀ ਹੈ, ਜਿਸਦਾ ਮਤਲਬ ਹੈ ਕਿ ਕੈਸ਼ ਸਾਫ਼ ਕਰਨ ਜਾਂ ਬ੍ਰਾਊਜ਼ਰ ਨੂੰ ਮੁੜ-ਇੰਸਟਾਲ ਕਰਨ ਨਾਲ ਤੁਹਾਡੀ ਪ੍ਰਗਤੀ ਕਦੇ ਵੀ ਹਟਾਈ ਨਹੀਂ ਜਾਵੇਗੀ।",
      tags: ["ਵੀਡੀਓ ਪਲੇਬੈਕ", "ਪ੍ਰਗਤੀ", "ਪ੍ਰਵਾਨਗੀਆਂ", "ਕੈਸ਼"]
    },
    es: {
      question: "¿Cuáles son las reglas de reproducción de video y cómo se realiza el seguimiento del progreso en ViBe?",
      answer: "Los videos deben verse completamente y en secuencia en la pestaña activa de ViBe. Es posible que se requieran permisos de cámara y micrófono según la configuración de supervisión del curso. Las interrupciones del reproductor se pueden desencadenar al cambiar de pestaña, quedar inactivo, tener poca iluminación o ruido de fondo excesivo. El progreso se almacena en el servidor y está vinculado de forma segura a su ID de correo electrónico registrado, lo que significa que borrar la caché o reinstalar su navegador nunca eliminará o borrará su progreso.",
      tags: ["Vídeo", "Progreso", "Permisos", "Caché"]
    }
  },
  "FAQ-021": {
    hi: {
      question: "ViBe पर पेनल्टी स्कोर, प्रोक्टरिंग नियम और अनुशंसित सेटअप क्या हैं?",
      answer: "पेनल्टी स्कोर असामान्य सीखने के व्यवहार से उत्पन्न होते हैं और आपसे वीडियो को फिर से देखने या क्विज़ को दोबारा लेने के लिए कह सकते हैं, लेकिन वे वर्तमान में आपके एचपी (HP) या अंतिम मूल्यांकन को प्रभावित नहीं करते हैं।\n\nप्रोक्टरिंग के लिए आवश्यक है कि आपका चेहरा पर्याप्त रोशनी के साथ कैमरा फ्रेम में स्पष्ट रूप से दिखाई दे, आमतौर पर केवल एक ही चेहरा दिखाई दे, अत्यधिक पृष्ठभूमि आवाज़ों से बचा जाए, और स्क्रीन से दूर देखने की लंबी अवधि को फ़्लैग न किया जाए। कृपया ध्यान दें कि ViBe लगातार वीडियो रिकॉर्ड नहीं करता है; सहमति शर्तों के अनुसार कैमरे और माइक का उपयोग मुख्य रूप से वास्तविक समय अनुपालन जांच के लिए किया जाता है।\n\nअनुशंसित शिक्षण सेटअप:\n- सुनिश्चित करें कि मुख्य प्रकाश स्रोत सीधे आपके सामने हो।\n- जांचें कि कैमरा फ्रेम में केवल एक ही व्यक्ति हो।\n- शांत वातावरण में काम करें।\n- सीखते समय हमेशा आधिकारिक ViBe ब्राउज़र टैब पर सक्रिय रहें।",
      tags: ["प्रोक्टरिंग", "पेनल्टी", "गोपनीयता", "सीखने का सेटअप"]
    },
    pa: {
      question: "ViBe 'ਤੇ ਪੈਨਲਟੀ ਸਕੋਰ, ਪ੍ਰੋਕਟਰਿੰਗ ਨਿਯਮ ਅਤੇ ਸਿਫਾਰਸ਼ੀ ਸੈੱਟਅੱਪ ਕੀ ਹਨ?",
      answer: "ਪੈਨਲਟੀ ਸਕੋਰ ਗੈਰ-ਸਾਧਾਰਨ ਸਿੱਖਣ ਵਿਵਹਾਰ ਕਾਰਨ ਬਣਦੇ ਹਨ ਅਤੇ ਤੁਹਾਨੂੰ ਵੀਡੀਓ ਦੁਬਾਰਾ ਦੇਖਣ ਜਾਂ ਕੁਇਜ਼ ਦੁਬਾਰਾ ਦੇਣ ਲਈ ਕਹਿ ਸਕਦੇ ਹਨ, ਪਰ ਇਹ ਤੁਹਾਡੇ HP ਜਾਂ ਅੰਤਿਮ ਮੁਲਾਂਕਣ ਨੂੰ ਪ੍ਰਭਾਵਿਤ ਨਹੀਂ ਕਰਦੇ।\n\nਪ੍ਰੋਕਟਰਿੰਗ ਲਈ ਲੋੜ ਹੈ ਕਿ ਤੁਹਾਡਾ ਚਿਹਰਾ ਕੈਮਰਾ ਫਰੇਮ ਵਿੱਚ ਸਪਸ਼ਟ ਤੌਰ 'ਤੇ ਦਿਖਾਈ ਦੇਵੇ, ਬੈਕਗ੍ਰਾਊਂਡ ਵਿੱਚ ਆਵਾਜ਼ਾਂ ਤੋਂ ਬਚਿਆ ਜਾਵੇ, ਅਤੇ ਸਕ੍ਰੀਨ ਤੋਂ ਦੂਰ ਦੇਖਣ ਦੇ ਲੰਬੇ ਸਮੇਂ ਨੂੰ ਫਲੈਗ ਨਾ ਕੀਤਾ ਜਾਵੇ। ਕਿਰਪਾ ਕਰਕੇ ਨੋਟ ਕਰੋ ਕਿ ViBe ਲਗਾਤਾਰ ਵੀਡੀਓ ਰਿਕਾਰਡ ਨਹੀਂ ਕਰਦਾ ਹੈ।\n\nਸਿਫਾਰਸ਼ੀ ਸਿੱਖਣ ਸੈੱਟਅੱਪ:\n- ਯਕੀਨੀ ਬਣਾਓ ਕਿ ਲਾਈਟ ਸਿੱਧੀ ਤੁਹਾਡੇ ਚਿਹਰੇ 'ਤੇ ਪਵੇ।\n- ਕੈਮਰਾ ਫਰੇਮ ਵਿੱਚ ਕੇਵਲ ਇੱਕ ਵਿਅਕਤੀ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ।\n- ਸ਼ਾਂਤ ਵਾਤਾਵਰਣ ਵਿੱਚ ਕੰਮ ਕਰੋ।\n- ਪੜ੍ਹਦੇ ਸਮੇਂ ਹਮੇਸ਼ਾ ਅਧਿਕਾਰਤ ViBe ਬ੍ਰਾਊਜ਼ਰ ਟੈਬ 'ਤੇ ਸਰਗਰਮ ਰਹੋ।",
      tags: ["ਪ੍ਰੋਕਟਰਿੰਗ", "ਪੈਨਲਟੀ", "ਪ੍ਰਾਈਵੇਸੀ", "ਸੈੱਟਅੱਪ"]
    },
    es: {
      question: "¿Qué son los Puntajes de Penalización, las reglas de supervisión y la configuración recomendada en ViBe?",
      answer: "Los puntajes de penalización se generan por comportamientos de aprendizaje anómalos y pueden pedirle que vuelva a ver videos o que vuelva a realizar cuestionarios, pero actualmente no afectan sus HP ni su evaluación final.\n\nLa supervisión requiere que su rostro sea claramente visible en el cuadro de la cámara con la iluminación adecuada, que por lo general solo un rostro sea visible, que se eviten las voces de fondo excesivas y que no se marquen los períodos prolongados de mirar hacia otro lado de la pantalla. Tenga en cuenta que ViBe no graba video continuamente; la cámara y el micrófono se utilizan principalmente para verificaciones de cumplimiento en tiempo real de acuerdo con los términos de consentimiento.\n\nConfiguración de aprendizaje recomendada:\n- Asegúrese de que la fuente de luz principal esté frente a usted directamente.\n- Verifique que solo una persona esté en el cuadro de la cámara.\n- Trabaje en un ambiente silencioso.\n- Permanezca siempre activo en la pestaña oficial del navegador ViBe mientras aprende.",
      tags: ["Supervisión", "Penalización", "Privacidad", "Configuración"]
    }
  },
  "FAQ-022": {
    hi: {
      question: "ViBe पर अपेक्षित दैनिक सीखने की गति क्या है?",
      answer: "निरंतरता महत्वपूर्ण है। निरंतर दैनिक शिक्षण अत्यधिक प्रिफर्ड है, और प्रति दिन लगभग 3.33% प्रगति प्राप्त करना अधिकांश ट्रैकों के लिए एक अत्यधिक उपयोगी आधारभूत दिशानिर्देश है, जब तक कि कार्यक्रम-विशिष्ट मील के पत्थर भिन्न न हों।",
      tags: ["सीखने की लय", "प्रगति", "मील के पत्थर"]
    },
    pa: {
      question: "ViBe 'ਤੇ ਰੋਜ਼ਾਨਾ ਪ੍ਰਤੀ ਦਿਨ ਸਿੱਖਣ ਦੀ ਸਿਫਾਰਸ਼ ਕੀ ਹੈ?",
      answer: "ਲਗਾਤਾਰ ਪੜ੍ਹਨਾ ਮਹੱਤਵਪੂਰਨ ਹੈ। ਰੋਜ਼ਾਨਾ ਨਿਰੰਤਰ ਸਿੱਖਣ ਨੂੰ ਬਹੁਤ ਤਰਜੀਹ ਦਿੱਤੀ ਜਾਂਦੀ ਹੈ, ਅਤੇ ਪ੍ਰਤੀ ਦਿਨ ਲਗਭਗ 3.33% ਪ੍ਰਗਤੀ ਪ੍ਰਾਪਤ ਕਰਨਾ ਬਹੁਤ ਸਾਰੇ ਟ੍ਰੈਕਾਂ ਲਈ ਇੱਕ ਲਾਭਦਾਇਕ ਬੁਨਿਆਦੀ ਸੇਧ ਹੈ।",
      tags: ["ਸਿੱਖਣ ਦੀ ਲੈਅ", "ਪ੍ਰਗਤੀ", "ਮੀਲ ਪੱਥਰ"]
    },
    es: {
      question: "¿Cuál es el ritmo de aprendizaje diario esperado en ViBe?",
      answer: "La coherencia es la clave. El aprendizaje diario constante es altamente preferido, y lograr aproximadamente un 3.33 % de progreso por día es una guía de referencia muy útil para la mayoría de las pistas, a menos que los hitos específicos del programa difieran.",
      tags: ["Ritmo", "Progreso", "Hitos"]
    }
  },
  "FAQ-023": {
    hi: {
      question: "टीम गठन, समन्वय सहायता और निष्क्रिय सदस्यों के संबंध में क्या नियम हैं?",
      answer: "परियोजना चरणों के दौरान टीम की भागीदारी पूरी तरह से अनिवार्य है। टीमों में कार्यक्रम के नियमों के अनुसार 4 सदस्य शामिल होने चाहिए, और टीम में आमतौर पर बदलाव की अनुमति नहीं है। जब तक विशेष रूप से अनुमति न दी जाए, एक ही कॉलेज से टीम बनाने को हतोत्साहित किया जाता है।\n\nआधिकारिक संचार समागम घोषणाओं और यक्ष (Yaksha) के माध्यम से होता है। टीम का समन्वय लिंक्डइन (LinkedIn) या ईमेल के माध्यम से होना चाहिए; इंटर्नशिप टीम समन्वय के लिए व्हाट्सएप समूहों का उपयोग सख्त वर्जित है।\n\nटीम के डिलिवरेबल्स सीधे मूल्यांकन में योगदान करते हैं। किसी भी निष्क्रिय सदस्य की सूचना तुरंत आपके आवंटित आकाओं/विद्वानों को दी जानी चाहिए।",
      tags: ["टीमें", "व्हाट्सएप", "लिंक्डइन", "संचार", "निष्क्रिय सदस्य"]
    },
    pa: {
      question: "ਟੀਮ ਬਣਾਉਣ, ਤਾਲਮੇਲ ਸਹਾਇਤਾ ਅਤੇ ਅਕਿਰਿਆਸ਼ੀਲ ਮੈਂਬਰਾਂ ਬਾਰੇ ਕੀ ਨਿਯਮ ਹਨ?",
      answer: "ਪ੍ਰੋਜੈਕਟ ਪੜਾਵਾਂ ਦੌਰਾਨ ਟੀਮ ਦੀ ਭਾਗੀਦਾਰੀ ਸਖ਼ਤੀ ਨਾਲ ਲਾਜ਼ਮੀ ਹੈ। ਟੀਮਾਂ ਵਿੱਚ ਪ੍ਰੋਗਰਾਮ ਦੇ ਨਿਯਮਾਂ ਅਨੁਸਾਰ 4 ਮੈਂਬਰ ਹੋਣੇ ਚਾਹੀਦੇ ਹਨ, ਅਤੇ ਟੀਮ ਦੇ ਬਦਲਾਅ ਦੀ ਆਮ ਤੌਰ 'ਤੇ ਇਜਾਜ਼ਤ ਨਹੀਂ ਹੁੰਦੀ। ਇੱਕੋ ਕਾਲਜ ਤੋਂ ਟੀਮ ਬਣਾਉਣ ਨੂੰ ਹਤ ਉਤਸ਼ਾਹਿਤ ਕੀਤਾ ਜਾਂਦਾ ਹੈ।\n\nਅਧਿਕਾਰਤ ਸੰਚਾਰ ਸਮਾਗਮ ਘੋਸ਼ਣਾਵਾਂ ਅਤੇ ਯਕਸ਼ ਰਾਹੀਂ ਹੁੰਦਾ ਹੈ। ਟੀਮ ਦਾ ਤਾਲਮੇਲ ਲਿੰਕਡਇਨ ਜਾਂ ਈਮੇਲ ਰਾਹੀਂ ਹੋਣਾ ਚਾਹੀਦਾ ਹੈ। ਵਟਸਐਪ ਗਰੁੱਪਾਂ ਦੀ ਵਰਤੋਂ ਸਖ਼ਤੀ ਨਾਲ ਵਰਜਿਤ ਹੈ।\n\nਟੀਮ ਦੇ ਕਾਰਜ ਸਿੱਧੇ ਮੁਲਾਂਕਣ ਵਿੱਚ ਯੋਗਦਾਨ ਪਾਉਂਦੇ ਹਨ। ਕਿਸੇ ਵੀ ਅਕਿਰਿਆਸ਼ੀਲ ਮੈਂਬਰ ਦੀ ਰਿਪੋਰਟ ਤੁਰੰਤ ਮੈਂਟਰਾਂ ਨੂੰ ਕੀਤੀ ਜਾਣੀ ਚਾਹੀਦੀ ਹੈ।",
      tags: ["ਟੀਮਾਂ", "ਵਟਸਐਪ", "ਲਿੰਕਡਇਨ", "ਸੰਚਾਰ", "ਅਕਿਰਿਆਸ਼ੀਲ"]
    },
    es: {
      question: "¿Cuáles son las reglas con respecto a la formación de equipos, el apoyo de coordinación y los miembros inactivos?",
      answer: "La participación en el equipo es estrictamente obligatoria durante las fases del proyecto. Los equipos deben estar integrados por 4 miembros, asignados o formados de acuerdo con las reglas del programa, y por lo general no se permiten cambios de equipo. Se desaconseja formar equipos de la misma universidad a menos que se permita específicamente.\n\nLa comunicación oficial se realiza a través de anuncios de Samagama y Yaksha. La coordinación de los equipos debe realizarse a través de LinkedIn o correo electrónico; los grupos de WhatsApp para la coordinación de equipos están estrictamente prohibidos.\n\nLos entregables del equipo contribuyen directamente a la evaluación. Cualquier miembro inactivo debe ser informado de inmediato a sus mentores asignados.",
      tags: ["Equipos", "WhatsApp", "LinkedIn", "Comunicación", "Inactivos"]
    }
  },
  "FAQ-024": {
    hi: {
      question: "मैं प्लेटफ़ॉर्म समस्याओं या बग को कैसे आगे बढ़ाऊँ, और सहायता को संचालित करने वाले सामान्य सिद्धांत क्या हैं?",
      answer: "किसी पाठ्यक्रम की सामग्री-संबंधी समस्याओं के लिए, कृपया ViBe 'Flag' विकल्प का उपयोग करें। तकनीकी या प्लेटफ़ॉर्म-संबंधी समस्याओं के लिए, यक्ष बॉट से सीधे संपर्क करें। व्यापक प्लेटफ़ॉर्म समस्याओं को स्लैक चैनल में '#escalate-ViBe' के साथ बढ़ाया जा सकता है।\n\nसामान्य सिद्धांत:\nइन निर्देशों और नियमों को मार्गदर्शन का आधिकारिक स्रोत माना जाता है। हम बाहरी अनुमानों के बजाय आधिकारिक अक्सर पूछे जाने वाले प्रश्नों (FAQs) को पसंद करते हैं। यदि कोई स्थिति इन आधिकारिक दिशानिर्देशों में स्पष्ट रूप से शामिल नहीं है, तो आधिकारिक नियमों द्वारा विवरण निर्दिष्ट नहीं है।",
      tags: ["शिकायत", "सहायता", "फ्लैग विकल्प", "स्लैक एस्केलेशन"]
    },
    pa: {
      question: "ਮੈਂ ਪਲੇਟਫਾਰਮ ਦੀਆਂ ਸਮੱਸਿਆਵਾਂ ਜਾਂ ਬੱਗ ਨੂੰ ਕਿਸ ਤਰ੍ਹਾਂ ਵਧਾਵਾਂ, ਅਤੇ ਸਹਾਇਤਾ ਲਈ ਆਮ ਨਿਯਮ ਕੀ ਹਨ?",
      answer: "ਕੋਰਸ ਵਿੱਚ ਸਮੱਗਰੀ-ਸੰਬੰਧੀ ਸਮੱਸਿਆਵਾਂ ਲਈ, ਕਿਰਪਾ ਕਰਕੇ ViBe 'Flag' ਵਿਕਲਪ ਦੀ ਵਰਤੋਂ ਕਰੋ। ਤਕਨੀਕੀ ਜਾਂ ਪਲੇਟਫਾਰਮ-ਸੰਬੰਧੀ ਸਮੱਸਿਆਵਾਂ ਲਈ, ਯਕਸ਼ ਬੋਟ ਨਾਲ ਸਿੱਧਾ ਸੰਪਰਕ ਕਰੋ। ਵਿਸਤ੍ਰਿਤ ਪਲੇਟਫਾਰਮ ਸਮੱਸਿਆਵਾਂ ਨੂੰ ਸਲੈਕ ਚੈਨਲ ਵਿੱਚ '#escalate-ViBe' ਰਾਹੀਂ ਦੱਸਿਆ ਜਾ ਸਕਦਾ ਹੈ।\n\nਆਮ ਸਿਧਾਂਤ:\nਇਹ ਨਿਯਮ ਮਾਰਗਦਰਸ਼ਨ ਦਾ ਅਧਿਕਾਰਤ ਸਰੋਤ ਮੰਨੇ ਜਾਂਦੇ ਹਨ। ਅਸੀਂ ਬਾਹਰੀ ਧਾਰਨਾਵਾਂ ਨਾਲੋਂ ਅਧਿਕਾਰਤ FAQs ਨੂੰ ਤਰਜੀਹ ਦਿੰਦੇ ਹਾਂ। ਜੇਕਰ ਕੋਈ ਸ਼ਰਤ ਇਹਨਾਂ ਅਧਿਕਾਰਤ ਦਿਸ਼ਾ-ਨਿਰਦੇਸ਼ਾਂ ਵਿੱਚ ਸ਼ਾਮਲ ਨਹੀਂ ਹੈ, ਤਾਂ ਅਧਿਕਾਰਤ ਨਿਯਮਾਂ ਦੁਆਰਾ ਇਸਦਾ ਵੇਰਵਾ ਨਹੀਂ ਦਿੱਤਾ ਗਿਆ ਹੈ।",
      tags: ["ਸ਼ਿਕਾਇਤ", "ਸਹਾਇਤਾ", "ਫਲੈਗ ਵਿਕਲਪ", "ਸਲੈਕ"]
    },
    es: {
      question: "¿Cómo puedo reportar problemas o errores en la plataforma y cuáles son los principios generales que rigen el soporte?",
      answer: "Para problemas relacionados con el contenido de un curso, utilice la opción 'Marcar' de ViBe. Para problemas técnicos o relacionados con la plataforma, comuníquese directamente con Yaksha bot. Los problemas persistentes de la plataforma se pueden escalar a través del canal de Slack usando '#escalate-ViBe'.\n\nPrincipio General:\nEstas instrucciones y reglas se consideran la fuente de orientación autorizada. Preferimos las pautas oficiales de preguntas frecuentes sobre las suposiciones externas. Si una situación no está cubierta explícitamente en estas pautas oficiales, las preguntas frecuentes oficiales no lo especifican.",
      tags: ["Escalación", "Soporte", "Marcar opción", "vibe-escalate"]
    }
  }
};
