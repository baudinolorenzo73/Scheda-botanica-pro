# Scheda Botanica PRO 3.21 — diagnosi traccia GPS

La prima schermata e la Mappa mostrano se il GPS è in ascolto, se un fix è stato scartato per precisione peggiore di 50 m, quando è stato salvato l'ultimo punto e quando il segnale non arriva più. Un contatore di punti da solo non indica che il GPS continui a funzionare: ora lo stato lo chiarisce.

Quando torni all'app dopo averla messa in background, l'ascolto GPS viene riattivato. Se manca un intervallo significativo, la traccia prosegue in un nuovo tratto, senza disegnare una linea artificiale tra due posizioni lontane nel tempo. I fix ricevuti vengono scritti in sequenza nel database; la cancellazione attende eventuali scritture già avviate prima di svuotare la traccia.

**Limite del browser:** Android Chrome può sospendere l'accesso alla geolocalizzazione appena la pagina passa in background, incluso lo schermo spento. La PWA non può garantire una traccia continua in queste condizioni. Per una registrazione affidabile con schermo spento serve un'app Android nativa con servizio di posizione in primo piano; se usi questa PWA, mantienila visibile durante il rilievo e verifica i punti nella Mappa prima di esportare il GPX.
