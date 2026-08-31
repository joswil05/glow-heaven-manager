import React, { useState } from 'react';
import { Users, Search, Plus, MessageSquare, Edit2 } from 'lucide-react';
import type { Cliente } from '../../../shared/types';
import { EmptyState } from '../components/shared/EmptyState';
import { useToast } from '../context/ToastContext';
import {
  DataTable,
  type Column,
  Badge,
  Button,
  Field,
  Input,
  Select,
  Textarea,
} from '../components/ui';

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
          showUndoToast(`Cliente ${res.data.nombre} actualizado`, () => onRefresh(), res.data.evento_grupo_id);
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
          showUndoToast(`Cliente ${res.data.nombre} creado`, () => onRefresh(), res.data.evento_grupo_id);
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

  const columnas: Column<Cliente>[] = [
    {
      key: 'nombre',
      header: 'Nombre',
      render: (c) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-900">{c.nombre}</span>
          {Boolean(c.incumplio_anteriormente) && (
            <Badge tone="danger">70% anticipo</Badge>
          )}
        </div>
      ),
    },
    {
      key: 'ciudad',
      header: 'Ciudad',
      render: (c) => c.ciudad,
    },
    {
      key: 'telefono',
      header: 'Teléfono',
      render: (c) => c.telefono,
    },
    {
      key: 'acciones',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenWhatsApp(c);
            }}
          >
            <MessageSquare className="w-3.5 h-3.5 mr-1 text-emerald-600" />
            <span>WhatsApp</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenEdit(c);
            }}
          >
            <Edit2 className="w-3.5 h-3.5 mr-1" />
            <span>Editar</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      {/* Encabezado y búsqueda */}
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 flex-1 max-w-md">
          <div className="relative w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre, teléfono o ciudad..."
              className="pl-9"
            />
          </div>
        </div>

        <Button variant="primary" onClick={handleOpenCreate}>
          <Plus className="w-4 h-4 mr-1" />
          <span>Nuevo Cliente</span>
        </Button>
      </div>

      {/* Lista de Clientes en DataTable */}
      <div className="flex-1 p-6 overflow-y-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-body">Cargando clientes...</div>
        ) : filteredClientes.length > 0 ? (
          <DataTable
            columns={columnas}
            rows={filteredClientes}
            rowKey={(c) => c.id}
            emptyMessage="No hay clientes registrados."
          />
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
          <div className="bg-white w-full max-w-md rounded-lg shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 bg-navy-900 text-white">
              <h3 className="text-title text-white">
                {editingCliente ? 'Editar Cliente' : 'Nuevo Cliente'}
              </h3>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <Field label="Nombre Completo *">
                <Input
                  required
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: María José Morales"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Teléfono / WhatsApp *">
                  <Input
                    required
                    value={telefono}
                    onChange={(e) => setTelefono(e.target.value)}
                    placeholder="8888-8888"
                  />
                </Field>

                <Field label="Ciudad *">
                  <Select
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
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
                  </Select>
                </Field>
              </div>

              <Field label="Dirección de Entrega">
                <Textarea
                  rows={2}
                  value={direccion}
                  onChange={(e) => setDireccion(e.target.value)}
                  placeholder="Punto de referencia y dirección exacta"
                />
              </Field>

              <div className="p-3 bg-danger-50 rounded-md border border-danger-100 flex items-center gap-2.5">
                <input
                  type="checkbox"
                  id="incumplio_cb"
                  checked={incumplio}
                  onChange={(e) => setIncumplio(e.target.checked)}
                  className="w-4 h-4 text-danger-600 rounded border-slate-300"
                />
                <label htmlFor="incumplio_cb" className="text-body text-danger-800 cursor-pointer">
                  <span className="font-medium">Cliente con historial de incumplimiento</span>
                  <p className="text-caption text-danger-700">
                    El sistema sugerirá pedir 70% de anticipo en lugar de 50%.
                  </p>
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setModalOpen(false)}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={guardando}
                >
                  {guardando ? 'Guardando...' : 'Guardar Cliente'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
