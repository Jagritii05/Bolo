"""Runtime compatibility patches for Graftcode Gateway (gg.exe) embedded Python on Windows."""

import os
import sys

if sys.platform == "win32":
    dll_candidates = [
        os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")),
        os.path.join(sys.prefix, "Lib", "site-packages", "av.libs"),
        os.path.join(sys.prefix, "Lib", "site-packages", "ctranslate2"),
        os.path.join(sys.prefix, "Lib", "site-packages", "numpy.libs"),
    ]
    cur_path = os.environ.get("PATH", "")
    for d in dll_candidates:
        if os.path.isdir(d):
            try:
                os.add_dll_directory(d)
            except Exception:
                pass
            if d.lower() not in cur_path.lower():
                cur_path = d + os.pathsep + cur_path
    os.environ["PATH"] = cur_path

try:
    from graftcode_python_logger import GCLoggerFactory

    GCLoggerFactory._initialize_logger = lambda self: None
    GCLoggerFactory._enhance_log_record = staticmethod(lambda record: True)
except Exception:
    pass

try:
    from graftcode_protocol.protocol.serializers.type_serializer import (
        TypeSerializer as GmaTypeSerializer,
    )

    def _fast_gma_serialize_primitive(payload_item):
        if payload_item is None:
            return GmaTypeSerializer.serialize_none()
        if isinstance(payload_item, bool):
            return GmaTypeSerializer.serialize_bool(payload_item)
        elif isinstance(payload_item, int):
            if -2147483648 <= payload_item < 2147483648:
                return GmaTypeSerializer.serialize_int(payload_item)
            elif -9223372036854775808 <= payload_item < 9223372036854775808:
                return GmaTypeSerializer.serialize_longlong(payload_item)
            else:
                return GmaTypeSerializer.serialize_ullong(payload_item)
        elif isinstance(payload_item, float):
            return GmaTypeSerializer.serialize_double(payload_item)
        elif isinstance(payload_item, str):
            return GmaTypeSerializer.serialize_string(payload_item)
        else:
            raise Exception(
                "Python: Type serialization not supported for type: "
                + str(type(payload_item))
            )

    GmaTypeSerializer.serialize_primitive = staticmethod(_fast_gma_serialize_primitive)
except Exception:
    pass

try:
    from hypertube.core.protocol.TypeSerializer import (
        TypeSerializer as HypertubeTypeSerializer,
    )

    def _fast_ht_write_primitive(stream, payload_item):
        if payload_item is None:
            stream.write(HypertubeTypeSerializer._NONE_BYTES)
        elif isinstance(payload_item, bool):
            HypertubeTypeSerializer.write_bool(stream, payload_item)
        elif isinstance(payload_item, int):
            if -2147483648 <= payload_item < 2147483648:
                HypertubeTypeSerializer.write_int(stream, payload_item)
            elif -9223372036854775808 <= payload_item < 9223372036854775808:
                HypertubeTypeSerializer.write_longlong(stream, payload_item)
            else:
                HypertubeTypeSerializer.write_ullong(stream, payload_item)
        elif isinstance(payload_item, float):
            HypertubeTypeSerializer.write_double(stream, payload_item)
        elif isinstance(payload_item, str):
            HypertubeTypeSerializer.write_string(stream, payload_item)
        else:
            raise TypeError(
                f"Unsupported payload item type: {type(payload_item)} for payload item: {payload_item}."
            )

    HypertubeTypeSerializer.write_primitive = staticmethod(_fast_ht_write_primitive)
except Exception:
    pass

try:
    from moduleanalyzer.src.core.handler.interface_analyzer import InterfaceAnalyzer
    from moduleanalyzer.src.core.handler.analysis.library_analyzer import LibraryAnalyzer

    _orig_return_classes = InterfaceAnalyzer.return_classes_from_py

    def _filtered_return_classes(path: str):
        classes = _orig_return_classes(path)
        speech_only = [c for c in classes if getattr(c, "__name__", "") == "SpeechService"]
        return speech_only if speech_only else classes

    InterfaceAnalyzer.return_classes_from_py = staticmethod(_filtered_return_classes)
    LibraryAnalyzer._extract_global_functions_and_variables = lambda self, file_path: ([], [])

    from moduleanalyzer.src.core.handler.shared.shared_parameters_array_handler import (
        SharedParametersArrayHandler,
    )

    SharedParametersArrayHandler._add_is_parameter_optional = (
        lambda self, parameter_command, param: parameter_command.add_arg_to_payload(0)
    )
except Exception:
    pass
