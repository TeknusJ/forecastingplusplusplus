import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import Papa from 'papaparse';
import _ from 'lodash';
import { Upload, ChevronDown, ChevronUp } from 'lucide-react';

const ROLE_WEIGHTS = {
  'Lead': 1,
  'Co-Lead': 0.7,
  'Strategic Advisor': 0.3,
  'Supporting': 0.5
};

const PIPELINE_STAGE_WEIGHTS = {
  'On Hold and Introductory Meeting': 0.1,
  'Proposal Requested': 0.3,
  'Proposal Under Review': 0.5,
  'LOE Requested': 0.7,
  'LOE Under Review': 0.9,
  'Prospect': 0.4,
  'Closed Won': 1, // Adjusted to reflect active/current work
  'Follow On': 0.95
};

const MAX_RECOMMENDED_LOAD = 8;

const ConsultantCapacityDashboard = () => {
  const [consultantData, setConsultantData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [expandedConsultant, setExpandedConsultant] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [removePipelineWork, setRemovePipelineWork] = useState(false);
  const [internalWorkAdjustments, setInternalWorkAdjustments] = useState({});

  const handleInternalWorkChange = (consultantName, value) => {
    setInternalWorkAdjustments(prev => ({
      ...prev,
      [consultantName]: value
    }));
  };

  const [filters, setFilters] = useState({
    businessLine: 'all',
    timeframe: 'all',
    capacityStatus: 'all',
    consultantSearch: ''
  });

  const calculateWeightedLoad = (projects) => {
    return projects.reduce((total, project) => {
      const roleWeight = ROLE_WEIGHTS[project.role] || 0;
      const stageWeight = PIPELINE_STAGE_WEIGHTS[project.dealStage] || 0;
      const followOnWeight = project.projectName.includes('-Follow On') ? 0.95 : 1;
      return total + roleWeight * stageWeight * followOnWeight;
    }, 0);
  };

  const generateMonthlyTimeline = (projects, internalWorkPercentage) => {
    const months = [];
    const today = new Date();

    for (let i = 0; i < 12; i++) {
      const month = new Date(today.getFullYear(), today.getMonth() + i, 1);
      months.push(month);
    }

    return months.map(month => {
      const activeProjects = projects.filter(project => {
        const startDate = new Date(project.startDate);
        const endDate = new Date(project.endDate);
        return (!isNaN(startDate) && !isNaN(endDate)) &&
          (month >= startDate && month <= endDate);
      });

      const weightedLoad = calculateWeightedLoad(activeProjects);
      const adjustedCapacity = Math.max(0, MAX_RECOMMENDED_LOAD * (1 - internalWorkPercentage / 100) - weightedLoad);

      return {
        month: month.toLocaleString('default', { month: 'short', year: '2-digit' }),
        projects: activeProjects.length,
        weightedLoad: parseFloat(weightedLoad.toFixed(1)),
        capacity: parseFloat(adjustedCapacity.toFixed(1)),
        details: activeProjects.map(p => ({
          name: p.projectName,
          role: p.role,
          businessLine: p.businessLine
        }))
      };
    });
  };

  const processData = (parsedData) => {
    try {
      const splitConsultants = (str) => str ? str.split(';').map(s => s.trim()).filter(Boolean) : [];

      const projectsByConsultant = {};
      parsedData.data.forEach(project => {
        const processRole = (names, role) => {
          splitConsultants(names).forEach(name => {
            if (!projectsByConsultant[name]) {
              projectsByConsultant[name] = [];
            }
            projectsByConsultant[name].push({
              projectName: project['Deal Name'],
              role: role,
              startDate: project['Contract Start Date'],
              endDate: project['Contract End Date'],
              businessLine: project['Primary Business Line'],
              dealStage: project['Deal Stage']
            });
          });
        };

        processRole(project['Project Lead'], 'Lead');
        processRole(project['Project Co-Lead'], 'Co-Lead');
        processRole(project['Project Strategic Advisors'], 'Strategic Advisor');
        processRole(project['Project Supporting Consultants'], 'Supporting');
      });

      const consultantsWithTimeline = Object.entries(projectsByConsultant)
        .map(([name, projects]) => {
          const internalWorkPercentage = internalWorkAdjustments[name] || 0;
          return {
            name,
            projects: _.uniqBy(projects, 'projectName'),
            timeline: generateMonthlyTimeline(projects, internalWorkPercentage),
            currentLoad: projects.filter(p => {
              const now = new Date();
              const startDate = new Date(p.startDate);
              const endDate = new Date(p.endDate);
              return (!isNaN(startDate) && !isNaN(endDate)) &&
                (now >= startDate && now <= endDate);
            }).length
          };
        })
        .sort((a, b) => b.currentLoad - a.currentLoad);

      setConsultantData(consultantsWithTimeline);
      setFilteredData(consultantsWithTimeline);
    } catch (err) {
      setError('Error processing data: ' + err.message);
      setIsLoading(false);
    }
  };

  const handleFileUpload = (event) => {
    setIsLoading(true);
    setError(null);
    const file = event.target.files[0];

    if (file) {
      Papa.parse(file, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        complete: (results) => {
          processData(results);
          setIsLoading(false);
        },
        error: (error) => {
          setError('Error parsing CSV: ' + error.message);
          setIsLoading(false);
        }
      });
    } else {
      setIsLoading(false);
    }
  };

  const toggleConsultant = (consultantName) => {
    setExpandedConsultant(expandedConsultant === consultantName ? null : consultantName);
  };

  useEffect(() => {
    const applyFilters = () => {
      let filtered = [...consultantData];

      if (removePipelineWork) {
        filtered = filtered.map(consultant => ({
          ...consultant,
          projects: consultant.projects.filter(project =>
            project.dealStage === 'Closed Won'
          )
        }));
      }

      if (filters.businessLine !== 'all') {
        filtered = filtered.map(consultant => ({
          ...consultant,
          projects: consultant.projects.filter(project =>
            project.businessLine === filters.businessLine
          )
        }));
      }

      if (filters.timeframe !== 'all') {
        const months = parseInt(filters.timeframe);
        const cutoffDate = new Date();
        cutoffDate.setMonth(cutoffDate.getMonth() + months);

        filtered = filtered.map(consultant => ({
          ...consultant,
          projects: consultant.projects.filter(project => {
            const endDate = new Date(project.endDate);
            return endDate <= cutoffDate;
          })
        }));
      }

      if (filters.capacityStatus !== 'all') {
        filtered = filtered.filter(consultant => {
          const currentLoad = consultant.timeline[0].weightedLoad;
          switch (filters.capacityStatus) {
            case 'available':
              return currentLoad < MAX_RECOMMENDED_LOAD * 0.8;
            case 'at-capacity':
              return currentLoad >= MAX_RECOMMENDED_LOAD * 0.8 && currentLoad <= MAX_RECOMMENDED_LOAD;
            case 'over-capacity':
              return currentLoad > MAX_RECOMMENDED_LOAD;
            default:
              return true;
          }
        });
      }

      if (filters.consultantSearch) {
        filtered = filtered.filter(consultant =>
          consultant.name.toLowerCase().includes(filters.consultantSearch.toLowerCase())
        );
      }

      setFilteredData(filtered);
    };

    applyFilters();
  }, [filters, consultantData, removePipelineWork]);

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="mb-4 flex items-center">
        <label className="mr-2 text-sm font-medium text-gray-700">Remove Pipeline Work</label>
        <input
          type="checkbox"
          checked={removePipelineWork}
          onChange={(e) => setRemovePipelineWork(e.target.checked)}
          className="form-checkbox h-5 w-5 text-blue-600"
        />
      </div>

      <div className="mb-8 flex justify-between items-start">
        <div className="w-1/3">
          <label className="flex flex-col items-center justify-center p-6 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-white hover:bg-gray-50">
            <Upload className="w-8 h-8 text-gray-400" />
            <span className="mt-2 text-sm text-gray-600">Upload Hubspot CSV</span>
            <input type="file" className="hidden" accept=".csv" onChange={handleFileUpload} />
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 text-red-700 rounded">
          {error}
        </div>
      )}

      {isLoading && (
        <div className="mb-4 p-4 bg-blue-100 text-blue-700 rounded">
          Loading data, please wait...
        </div>
      )}

      {consultantData.length > 0 && (
        <div className="space-y-6">
          {filteredData.map((consultant) => (
            <div key={consultant.name} className="bg-white rounded-lg shadow">
              <button
                onClick={() => toggleConsultant(consultant.name)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50"
              >
                <div className="flex items-center space-x-4">
                  <span className="text-lg font-semibold">{consultant.name}</span>
                  <span className={`px-3 py-1 rounded-full text-sm ${
                    consultant.currentLoad >= MAX_RECOMMENDED_LOAD
                      ? 'bg-red-100 text-red-800'
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {consultant.currentLoad} Active Projects
                  </span>
                </div>
                {expandedConsultant === consultant.name ? (
                  <ChevronUp className="w-5 h-5 text-gray-500" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-500" />
                )}
              </button>

              {expandedConsultant === consultant.name && (
                <div className="px-6 pb-6">
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700">Internal Work Adjustment</label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="5"
                      value={internalWorkAdjustments[consultant.name] || 0}
                      onChange={(e) => handleInternalWorkChange(consultant.name, parseInt(e.target.value, 10))}
                      className="mt-2 w-full"
                    />
                    <span className="text-sm text-gray-600">{internalWorkAdjustments[consultant.name] || 0}%</span>
                  </div>

                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">12-Month Capacity Timeline</h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={consultant.timeline}
                          margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="month" />
                          <YAxis />
                          <Tooltip
                            content={({ active, payload, label }) => {
                              if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-white p-4 shadow rounded border">
                                    <p className="font-semibold">{label}</p>
                                    <p className="text-sm">Weighted Load: {data.weightedLoad}</p>
                                    <p className="text-sm text-green-600">Available Capacity: {data.capacity}</p>
                                    <div className="mt-2">
                                      <p className="text-xs font-semibold">Active Projects:</p>
                                      {data.details.map((project, idx) => (
                                        <p key={idx} className="text-xs">
                                          {project.name} ({project.role})
                                        </p>
                                      ))}
                                    </div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <Legend />
                          <Bar dataKey="weightedLoad" fill="#8884d8" name="Project Load" />
                          <Bar dataKey="capacity" fill="#82ca9d" name="Available Capacity" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="mt-6">
                    <h4 className="text-sm font-medium text-gray-500 mb-2">Current Projects</h4>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Project</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Line</th>
                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Timeline</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                          {consultant.projects.map((project, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-4 py-3 text-sm text-gray-900">{project.projectName}</td>
                              <td className="px-4 py-3 text-sm">
                                <span className={`px-2 py-1 rounded-full text-xs ${
                                  project.role === 'Lead' ? 'bg-green-100 text-green-800' :
                                  project.role === 'Co-Lead' ? 'bg-blue-100 text-blue-800' :
                                  project.role === 'Strategic Advisor' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {project.role}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-sm text-gray-500">{project.businessLine}</td>
                              <td className="px-4 py-3 text-sm text-gray-500">
                                {project.startDate} - {project.endDate}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ConsultantCapacityDashboard;
