import React, { useState } from 'react';
import { Users, Search, Plus, Phone, MapPin, Edit, MessageSquare, AlertTriangle } from 'lucide-react';
import type { Cliente } from '../../../shared/types';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../context/ToastContext';

interface ClientesViewProps {
  clientes: Cliente[];
  loading: boolean;
  onRefresh: () => void;
  openNewModalOnMount?: boolean;
}

export const ClientesView: React.FC<ClientesViewProps> = ({
  clientes,
  loading,
  onRefresh,
}) => {
  const { showToast, showUndoToast } = useToast();
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCliente, setEditingCliente] = useState<Cliente | null>(null);

  // Formulario
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [ciudad, setCiudad] = useState('León');
  const [direccion, setDireccion] = useState('');
  const [notas, setNotas] = useState('');
  const [incumplio, setIncumplio] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const filteredClientes = clientes.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.nombre.toLowerCase().includes(q) ||
      c.telefono.includes(q) ||
      c.ciudad.toLowerCase().includes(q)
    );
  });

  const handleOpenCreate = () => {
    setEditingCliente(null);
    setNombre('');
    setTelefono('');
    setCiudad('León');
    setDireccion('');
    setNotas('');
    setIncumplio(false);
    setModalOpen(true);
  };

  const handleOpenEdit = (c: Cliente) => {
    setEditingCliente(c);
    setNombre(c.nombre);
    setTelefono(c.telefono);
    setCiudad(c.ciudad);
    setDireccion(c.direccion || '');
    setNotas(c.notas || '');
    setIncumplio(Boolean(c.incumplio_anteriormente));
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !telefono.trim()) {
      showToast({ message: 'Nombre y teléfono son obligatorios', type: 'error' });
      return;
    }

    try {
      setGuardando(true);
      if (editingCliente) {
        const res = await window.api.clientes.update(editingCliente.id, {
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          ciudad: ciudad.trim(),
          direccion: direccion.trim() || undefined,
          notas: notas.trim() || undefined,
          incumplio_anteriormente: incumplio,
        });
        if (res.success) {
          showUndoToast(`Cliente ${res.data.nombre} actualizado`, () => onRefresh());
          onRefresh();
          setModalOpen(false);
        } else {
          showToast({ message: res.error.message, type: 'error' });
        }
      } else {
        const res = await window.api.clientes.create({
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          ciudad: ciudad.trim(),
          direccion: direccion.trim() || undefined,
          notas: notas.trim() || undefined,
          incumplio_anteriormente: incumplio,
        });
        if (res.success) {
          showUndoToast(`Cliente ${res.data.nombre} creado`, () => onRefresh());
          onRefresh();
          setModalOpen(false);
        } else {
          showToast({ message: res.error.message, type: 'error' });
        }
      }
    } catch {
      showToast({ message: 'Error al guardar cliente', type: 'error' });
    } finally {
      setGuardando(false);
    }
  };

  const handleOpenWhatsApp = (c: Cliente) => {
    window.api.sistema.abrirWhatsApp(c.telefono, `Hola ${c.nombre}, te saludo de Glow Heaven.`);
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Encabezado y búsqueda */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o ciudad..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
            />
          </div>
        </div>

        <button
          onClick={handleOpenCreate}
          className="flex items-center gap-1.5 px-4 py-2 bg-glow-600 hover:bg-glow-700 text-white rounded-xl text-xs font-bold transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>Nuevo Cliente</span>
        </button>
      </div>

      {/* Lista de Clientes */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-sm">Cargando clientes...</div>
        ) : filteredClientes.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredClientes.map((c) => (
              <div
                key={c.id}
                className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm space-y-3 hover:border-slate-300 transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-slate-900">{c.nombre}</h4>
                      {Boolean(c.incumplio_anteriormente) && (
                        <span
                          title="Incumplió anteriormente (pedir 70% anticipo)"
                          className="px-1.5 py-0.5 bg-danger-100 text-danger-700 text-[10px] font-bold rounded-md flex items-center gap-0.5"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          70% Ant.
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{c.ciudad}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenEdit(c)}
                    className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-1 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold">{c.telefono}</span>
                  </div>
                  {c.direccion && (
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {c.direccion}
                    </p>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                  <button
                    onClick={() => handleOpenWhatsApp(c)}
                    className="flex items-center gap-1.5 text-emerald-600 hover:text-emerald-700 text-xs font-bold"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp</span>
                  </button>
                  <span className="text-[11px] font-semibold text-slate-400">
                    Cliente #{c.id}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No se encontraron clientes"
            description="Registra clientes para asociarles cotizaciones y pedidos rápidamente."
            actionText="Registrar Cliente"
            onAction={handleOpenCreate}
          />
        )}
      </div>

      {/* Modal Nuevo / Editar Cliente */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-slate-900 text-white">
              <h3 className="text-base font-bold">
                {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Completo *
                </label>
                <input
                  type="text"
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: María José Morales"
                  className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <input
                    type="text"
                    required
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="8888-8888"
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Ciudad *
                  </label>
                  <select
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
                  >
                    <option value="León">León</option>
                    <option value="Chichigalpa">Chichigalpa</option>
                    <option value="Chinandega">Chinandega</option>
                    <option value="Managua">Managua</option>
                    <option value="Masaya">Masaya</option>
                    <option value="Granada">Granada</option>
                    <option value="Matagalpa">Matagalpa</option>
                    <option value="Estelí">Estelí</option>
                    <option value="Otra">Otra</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Dirección de Entrega
                </label>
                <textarea
                  rows={2}
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Punto de referencia y dirección exacta"
                  className="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-glow-500"
                />
              </div>

              <div className="p-3 bg-danger-50 rounded-xl border border-danger-100 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="incumplio_cb"
                  checked={incumplio}
                  onChange={(e) => setIncumplio(e.target.checked)}
                  className="w-4 h-4 text-danger-600 rounded border-slate-300"
                />
                <label htmlFor="incumplio_cb" className="text-xs text-danger-800 cursor-pointer">
                  <span className="font-bold">Cliente con historial de incumplimiento</span>
                  <p className="text-[11px] text-danger-700">
                    El sistema sugerirá pedir 70% de anticipo en lugar de 50%.
                  </p>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="px-5 py-2 bg-glow-600 hover:bg-glow-700 text-white text-xs font-bold rounded-xl shadow-sm disabled:opacity-50"
                >
                  {guardando ? 'Guardando...' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
