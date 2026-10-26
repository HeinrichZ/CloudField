function res = cloudfield_sdk(action, varargin)
% CLOUDFIELD_SDK  MATLAB / GNU Octave interface for CloudField Microphysics & CFD Sandbox
%
% Supported actions:
%   1) cf = cloudfield_sdk('workspace', 'preset', 'cloudlab')
%      Generates and evaluates the native MATLAB struct `cf` containing:
%        - cf.summary.*   : Scalar diagnostics (vis, LWP, IWP, CRE_SW, CAPE, icing, SVR, EDR)
%        - cf.profile.*   : 57-level 1D column vectors (z_m, p_Pa, T_K, theta_K, rho_kgm3,
%                           qv_kgkg, qc_kgkg, u_ms, v_ms, tke_m2s2, eps_m2s3, LWC_gm3, vis_m)
%                           ready for Simulink 1-D Lookup Tables & Aerospace Blockset
%        - cf.slice.*     : 2D horizontal visibility grid (x_km, y_km, vis_m)
%        - cf.langmuir.*  : 7-bin Langmuir droplet spectrum for FENSAP-ICE / LEWICE
%
%   2) tbl = cloudfield_sdk('profile', 'preset', 'fzra')
%      Exports 57-level vertical profile CSV and loads it as a MATLAB `table` (or struct).
%
%   3) rows = cloudfield_sdk('batch', stations_json_file, [0, 6, 12, 18])
%      Runs multi-station × multi-time batch diagnostics via tools/cli.js and parses JSON.
%
%   4) out_path = cloudfield_sdk('export_cfd', 'openfoam' | 'fluent' | 'vtk' | 'nml', out_file, 'preset', 'cloudlab')
%      Exports boundary/grid files directly for OpenFOAM, ANSYS Fluent / FENSAP-ICE, ParaView VTK, or ICON-LES.

    if nargin < 1 || isempty(action)
        action = 'workspace';
    end

    sdk_dir = fileparts(mfilename('fullpath'));
    root_dir = fileparts(sdk_dir);
    cli_js = fullfile(root_dir, 'tools', 'cli.js');
    if ~exist(cli_js, 'file')
        error('CloudField:CLINotFound', 'Cannot find tools/cli.js at %s', cli_js);
    end

    node_bin = getenv('CLOUDFIELD_NODE');
    if isempty(node_bin)
        node_bin = 'node';
    end

    switch lower(action)
        case 'workspace'
            extra = parse_kv_flags(varargin);
            tmp_m = [tempname(), '_cf_data.m'];
            cleanupObj = onCleanup(@() safe_delete(tmp_m));
            cmd = sprintf('"%s" "%s" --format matlab --out "%s" %s', node_bin, cli_js, tmp_m, extra);
            [status, cmdout] = system(cmd);
            if status ~= 0
                error('CloudField:CLIError', 'Node CLI failed: %s', cmdout);
            end
            run(tmp_m);
            res = cf;

        case 'profile'
            extra = parse_kv_flags(varargin);
            tmp_csv = [tempname(), '_cf_profile.csv'];
            cleanupObj = onCleanup(@() safe_delete(tmp_csv));
            cmd = sprintf('"%s" "%s" --format profile-csv --out "%s" %s', node_bin, cli_js, tmp_csv, extra);
            [status, cmdout] = system(cmd);
            if status ~= 0
                error('CloudField:CLIError', 'Node CLI failed: %s', cmdout);
            end
            if exist('readtable', 'file')
                res = readtable(tmp_csv);
            else
                res = csvread(tmp_csv, 1, 0);
            end

        case 'batch'
            stations_arg = '';
            if numel(varargin) >= 1 && ~isempty(varargin{1})
                stations_arg = sprintf('--stations "%s"', varargin{1});
            end
            times_str = '0';
            if numel(varargin) >= 2 && ~isempty(varargin{2})
                times_vec = varargin{2};
                times_str = sprintf('%g,', times_vec);
                times_str(end) = [];
            end
            tmp_json = [tempname(), '_cf_batch.json'];
            cleanupObj = onCleanup(@() safe_delete(tmp_json));
            cmd = sprintf('"%s" "%s" %s --times %s --format json --out "%s"', ...
                node_bin, cli_js, stations_arg, times_str, tmp_json);
            [status, cmdout] = system(cmd);
            if status ~= 0
                error('CloudField:CLIError', 'Node CLI failed: %s', cmdout);
            end
            raw = fileread(tmp_json);
            if exist('jsondecode', 'builtin') || exist('jsondecode', 'file')
                parsed = jsondecode(raw);
                res = parsed.rows;
            else
                res = raw;
            end

        case 'export_cfd'
            if numel(varargin) < 2
                error('CloudField:InvalidArgs', 'Usage: cloudfield_sdk(''export_cfd'', fmt, out_file, ...)');
            end
            fmt = lower(varargin{1});
            out_file = varargin{2};
            extra = parse_kv_flags(varargin(3:end));
            cmd = sprintf('"%s" "%s" --format %s --out "%s" %s', node_bin, cli_js, fmt, out_file, extra);
            [status, cmdout] = system(cmd);
            if status ~= 0
                error('CloudField:CLIError', 'Node CLI failed: %s', cmdout);
            end
            res = out_file;

        otherwise
            error('CloudField:UnknownAction', 'Unknown action: %s', action);
    end
end

function flags = parse_kv_flags(args)
    parts = {};
    i = 1;
    while i <= numel(args)
        k = lower(char(args{i}));
        if i + 1 <= numel(args)
            v = args{i + 1};
            if strcmp(k, 'preset')
                parts{end + 1} = sprintf('--preset %s', char(v)); %#ok<AGROW>
            elseif strcmp(k, 'scheme')
                parts{end + 1} = sprintf('--scheme %s', char(v)); %#ok<AGROW>
            elseif strcmp(k, 'dropconc')
                parts{end + 1} = sprintf('--dropConc %g', v); %#ok<AGROW>
            elseif strcmp(k, 'seedinp')
                parts{end + 1} = sprintf('--seed-inp %g', v); %#ok<AGROW>
            end
            i = i + 2;
        else
            i = i + 1;
        end
    end
    flags = strjoin(parts, ' ');
end

function safe_delete(p)
    if exist(p, 'file')
        delete(p);
    end
end
