import React, { useEffect, useRef } from 'react';

export default function MapView({ leads }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersGroup = useRef(null);

    useEffect(() => {
        // Verifica se o Leaflet (L) está carregado globalmente
        if (!window.L) return;

        // Inicializa o mapa caso ainda não tenha sido criado
        if (!mapInstance.current && mapRef.current) {
            mapInstance.current = window.L.map(mapRef.current, {
                center: [-23.55052, -46.633308], // São Paulo padrão
                zoom: 12,
                zoomControl: true,
            });

            // Adiciona a camada de mapa (CartoDB Dark Matter para combinar com o tema escuro do Dashboard)
            window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
                subdomains: 'abcd',
                maxZoom: 20
            }).addTo(mapInstance.current);

            // Grupo para guardar os pins e facilitar a limpeza
            markersGroup.current = window.L.featureGroup().addTo(mapInstance.current);
        }

        return () => {
            // Destrói o mapa ao desmontar
            if (mapInstance.current) {
                mapInstance.current.remove();
                mapInstance.current = null;
                markersGroup.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!window.L || !mapInstance.current || !markersGroup.current) return;

        // Limpa os markers antigos
        markersGroup.current.clearLayers();

        // Filtra os leads que possuem coordenadas válidas
        const leadsWithCoords = leads.filter(l => 
            l.latitude && 
            l.longitude && 
            l.latitude !== 0 && 
            l.longitude !== 0 &&
            !isNaN(parseFloat(l.latitude)) &&
            !isNaN(parseFloat(l.longitude))
        );

        if (leadsWithCoords.length === 0) return;

        // Plota os pins
        leadsWithCoords.forEach(lead => {
            const lat = parseFloat(lead.latitude);
            const lng = parseFloat(lead.longitude);

            // Cria um popup HTML personalizado
            const formattedPhone = (lead.phone || '').replace(/\D/g, '');
            const whatsappLink = formattedPhone 
                ? `https://wa.me/${formattedPhone.startsWith('55') ? formattedPhone : '55' + formattedPhone}` 
                : null;

            const popupContent = `
                <div style="font-family: 'Inter', sans-serif; color: #1e293b; padding: 4px; min-width: 180px;">
                    <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #0f172a;">${lead.name}</h4>
                    <p style="margin: 0 0 6px 0; font-size: 11px; color: #64748b;">🏷️ ${lead.category || 'Sem categoria'}</p>
                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #64748b;">📍 ${lead.address || 'Sem endereço'}</p>
                    <div style="display: flex; gap: 6px;">
                        ${whatsappLink ? `
                            <a href="${whatsappLink}" target="_blank" style="background: #22c55e; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 11px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                💬 WhatsApp
                            </a>
                        ` : ''}
                        ${lead.website ? `
                            <a href="${lead.website}" target="_blank" style="background: #3b82f6; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 11px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                🌐 Site
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;

            // Pin customizado (círculo colorido estilo moderno)
            const marker = window.L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: '#3b82f6',
                color: '#ffffff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.85
            });

            marker.bindPopup(popupContent);
            markersGroup.current.addLayer(marker);
        });

        // Ajusta o zoom do mapa para enquadrar todos os pins automaticamente
        try {
            const bounds = markersGroup.current.getBounds();
            if (bounds.isValid()) {
                mapInstance.current.fitBounds(bounds, { padding: [40, 40] });
            }
        } catch (e) {
            console.error('Erro ao ajustar limites do mapa:', e);
        }

    }, [leads]);

    return (
        <div 
            ref={mapRef} 
            style={{ 
                width: '100%', 
                height: '100%', 
                minHeight: '400px', 
                borderRadius: '16px', 
                border: '1px solid #334155',
                overflow: 'hidden',
                background: '#1e293b'
            }} 
        />
    );
}
