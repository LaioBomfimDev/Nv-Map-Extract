import React, { useEffect, useRef, useState } from 'react';
import loadLeaflet from '../utils/loadLeaflet';
import { escapeHtml, safeExternalUrl } from '../utils/safeUrl';

export default function MapView({ leads }) {
    const mapRef = useRef(null);
    const mapInstance = useRef(null);
    const markersGroup = useRef(null);
    const [ready, setReady] = useState(!!window.L);

    // Carrega o Leaflet sob demanda na primeira vez que o mapa é montado.
    useEffect(() => {
        let cancelled = false;
        loadLeaflet()
            .then(() => { if (!cancelled) setReady(true); })
            .catch(e => console.error(e));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        // Espera o Leaflet (L) estar disponível globalmente
        if (!ready || !window.L) return;

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
    }, [ready]);

    useEffect(() => {
        if (!ready || !window.L || !mapInstance.current || !markersGroup.current) return;

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

            // Cria um popup HTML personalizado com cantos retos e cores adequadas
            const formattedPhone = (lead.phone || '').replace(/\D/g, '');
            const whatsappLink = formattedPhone 
                ? `https://wa.me/${formattedPhone.startsWith('55') ? formattedPhone : '55' + formattedPhone}` 
                : null;
            const websiteUrl = safeExternalUrl(lead.website);

            const popupContent = `
                <div style="font-family: 'Inter', sans-serif; color: #fafafa; padding: 6px; min-width: 190px; background: #18181b;">
                    <h4 style="margin: 0 0 4px 0; font-size: 13px; font-weight: 700; color: #fafafa;">${escapeHtml(lead.name || 'Sem nome')}</h4>
                    <p style="margin: 0 0 6px 0; font-size: 11px; color: #a1a1aa;">Categoria: ${escapeHtml(lead.category || 'Sem categoria')}</p>
                    <p style="margin: 0 0 8px 0; font-size: 11px; color: #52525b;">Endereço: ${escapeHtml(lead.address || 'Sem endereço')}</p>
                    <div style="display: flex; gap: 6px;">
                        ${whatsappLink ? `
                            <a href="${whatsappLink}" target="_blank" rel="noreferrer" style="background: #10b981; color: #fff; padding: 4px 8px; border-radius: 0px; font-size: 11px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                WhatsApp
                            </a>
                        ` : ''}
                        ${websiteUrl ? `
                            <a href="${escapeHtml(websiteUrl)}" target="_blank" rel="noreferrer" style="background: #06b6d4; color: #fff; padding: 4px 8px; border-radius: 0px; font-size: 11px; text-decoration: none; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                                Site
                            </a>
                        ` : ''}
                    </div>
                </div>
            `;

            // Pin customizado (círculo colorido estilo moderno verde esmeralda)
            const marker = window.L.circleMarker([lat, lng], {
                radius: 8,
                fillColor: '#10b981',
                color: '#ffffff',
                weight: 1.5,
                opacity: 1,
                fillOpacity: 0.9
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

    }, [leads, ready]);

    return (
        <div
            ref={mapRef}
            style={{ 
                width: '100%', 
                height: '100%', 
                minHeight: '400px', 
                borderRadius: '0px', 
                border: '1px solid #27272a',
                overflow: 'hidden',
                background: '#18181b'
            }} 
        />
    );
}
