import streamlit as st
import image_prompts_lib as glib


st.set_page_config(layout="wide", page_title="Image Generation")

st.title("Image Generation")

col1, col2 = st.columns(2)


with col1:
    st.subheader("Image parameters")
    
    prompt_text = st.text_area("What you want to see in the image:", height=100, help="The prompt text")
    negative_prompt = st.text_input("What shoud not be in the image:", help="The negative prompt")

    generate_button = st.button("Generate", type="primary")
    

with col2:
    st.subheader("Result")

    if generate_button:
        with st.spinner("Drawing..."):
            generated_image = glib.get_image_from_model(
                prompt_content=prompt_text, 
                negative_prompt=negative_prompt,
            )
        
        st.image(generated_image)