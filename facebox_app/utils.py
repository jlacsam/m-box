import numpy as np
import librosa
import io
import configparser
from keras_facenet import FaceNet
from mtcnn import MTCNN
from PIL import Image
from pydub import AudioSegment

# Initialize FaceNet model and MTCNN detector
facenet = FaceNet()
detector = MTCNN()

def preprocess_image(image):
    """
    Preprocess the image for FaceNet model
    :param image: PIL Image
    :return: preprocessed image
    """
    image = image.resize((160, 160))  # Resize image to the required size (160x160)
    image = np.asarray(image)  # Convert to numpy array
    image = image.astype('float32')  # Convert to float32
    mean, std = image.mean(), image.std()
    image = (image - mean) / std  # Standardize
    image = np.expand_dims(image, axis=0)  # Add batch dimension
    return image

def extract_face(image):
    """
    Detects and extracts the face from the image using MTCNN
    :param image: PIL Image
    :return: cropped face as PIL Image, bounding box
    """
    image_np = np.asarray(image)
    results = detector.detect_faces(image_np)
    if len(results) == 0:
        raise ValueError("No faces detected in the image")
    if len(results) > 1:
        raise ValueError("Multiple faces detected in the image")
    
    # Extract bounding box and face
    bounding_box = results[0]['box']
    x, y, width, height = bounding_box
    face = image.crop((x, y, x + width, y + height))
    return face, bounding_box

def get_face_embedding(image_bytes):
    """
    Generate face embedding for a given image
    :param image_bytes: image in bytes format
    :return: face embedding, bounding box
    """
    image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
    face, bounding_box = extract_face(image)
    preprocessed_face = np.expand_dims(np.array(face), axis=0)  # Prepare face for FaceNet embeddings
    embedding = facenet.embeddings(preprocessed_face)
    return embedding.flatten(), bounding_box

def get_voice_embedding(audio_segment):
    """ 
    Convert pydub AudioSegment to numpy array
    Normalize the samples, extract MFCCs, 
    Take the mean of each MFCC coefficient,
    Normalize the embedding
    """
    samples = np.array(audio_segment.get_array_of_samples()).astype(np.float32)
    samples = samples / np.max(np.abs(samples))
    mfccs = librosa.feature.mfcc(y=samples, sr=audio_segment.frame_rate, n_mfcc=13)
    mfcc_embedding = np.mean(mfccs, axis=1)
    mfcc_embedding_normalized = mfcc_embedding / np.linalg.norm(mfcc_embedding)

    return mfcc_embedding_normalized.tolist()

def validate_subscription(subscription_id, client_secret):
    """
    Validates the subscription ID and client secret
    :param subscription_id: subscription ID
    :param client_secret: client secret key
    :return: boolean indicating if the credentials are valid
    """
    # Implement your subscription validation logic here
    valid_subscription_ids = {"00000000": "00000000"}
    return valid_subscription_ids.get(subscription_id) == client_secret

def tuples_to_json(tuples,labels):
    if len(labels) != len(tuples[0]):
        print("Unequal labels and tuples!",labels,"\n",tuples[0])
        raise ValueError("Number of labels must match the number of elements in a tuple.")

    dict_list = []
    for item in tuples:
        dict_item = dict(zip(labels, item))
        dict_list.append(dict_item)

    return dict_list

def get_db_config(filename='params.cfg', section='postgresql'):
    # Create a parser
    parser = configparser.ConfigParser()
    # Read the configuration file
    parser.read(filename)

    # Get the section, default to postgresql
    db_params = {}
    if parser.has_section(section):
        params = parser.items(section)
        for param in params:
            db_params[param[0]] = param[1]
    else:
        raise Exception(f'Section {section} not found in the {filename} file')

    return db_params

def get_client_ip(request):
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

